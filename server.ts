import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  const isGoogleUrl = (url: string) => {
    if (!url) return true;
    return url.includes("generativelanguage.googleapis.com") || url.includes("googleapis.com");
  };

  const getGeminiAuth = (apiKey: string) => {
    let cleanApiKey = (apiKey || "").trim();
    if (cleanApiKey.startsWith("Bearer ")) {
      cleanApiKey = cleanApiKey.substring(7).trim();
    }
    // Remove enclosing quotes if any
    if ((cleanApiKey.startsWith('"') && cleanApiKey.endsWith('"')) || 
        (cleanApiKey.startsWith("'") && cleanApiKey.endsWith("'"))) {
      cleanApiKey = cleanApiKey.substring(1, cleanApiKey.length - 1).trim();
    }

    const isOAuth = cleanApiKey.startsWith("ya29.") || cleanApiKey.startsWith("eyJ");
    
    if (isOAuth) {
      return {
        key: cleanApiKey,
        headers: {
          "Authorization": `Bearer ${cleanApiKey}`
        },
        useQueryKey: false
      };
    } else {
      return {
        key: cleanApiKey,
        headers: {
          "x-goog-api-key": cleanApiKey
        },
        useQueryKey: true
      };
    }
  };

  // API routes
  // Cloudflare Workers Authentication & Database Binding Proxy
  app.post("/api/cf-auth", async (req, res) => {
    const { workerUrl, username, password, action } = req.body;
    if (!workerUrl) {
      return res.status(400).json({ success: false, error: "缺少 Cloudflare Worker 数据库 API URL" });
    }

    try {
      let baseUrl = workerUrl.trim();
      if (baseUrl.includes("dash.cloudflare.com")) {
        return res.status(400).json({
          success: false,
          error: "您填写的 URL 是 Cloudflare 控制台管理网址！\n请复制 Worker 部署成功后在右侧或【触发器】中分配给您的公开服务链接 (例如 https://your-subdomain.workers.dev)。"
        });
      }

      if (!baseUrl.startsWith("http://") && !baseUrl.startsWith("https://")) {
        baseUrl = "https://" + baseUrl;
      }

      // 移除末尾斜杠
      baseUrl = baseUrl.replace(/\/+$/, "");

      // 构造两套可能调用的端点 (兼容直接根路由 POST 与 /api/auth/login 等路由)
      const endpoints: string[] = [baseUrl];
      if (action === "login" || action === "ping") {
        endpoints.push(`${baseUrl}/api/auth/login`);
      } else if (action === "change" || action === "update") {
        endpoints.push(`${baseUrl}/api/auth/change`);
        endpoints.push(`${baseUrl}/api/auth/update`);
      }

      const reqBody = {
        action: action || "login",
        username: username || "",
        password: password || "",
        account: username || req.body.newAccount || "",
        newAccount: req.body.newAccount || "",
        newPassword: req.body.newPassword || "",
        oldPassword: req.body.oldPassword || "",
        timestamp: Date.now()
      };

      console.log(`[CF-Auth] Proxying ${action || 'login'} to Worker endpoints:`, endpoints);

      let lastErrorResponse: any = null;
      let lastStatusCode = 400;

      for (const url of endpoints) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 6000);

          const response = await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Accept": "application/json",
              "User-Agent": "AI-Studio-Cloudflare-Auth/1.0"
            },
            body: JSON.stringify(reqBody),
            signal: controller.signal
          });

          clearTimeout(timeoutId);

          const responseText = await response.text();
          let responseData: any = {};
          try {
            responseData = JSON.parse(responseText);
          } catch (e) {
            responseData = { message: responseText };
          }

          if (response.ok) {
            return res.json({
              success: true,
              status: response.status,
              data: responseData,
              message: responseData.message || responseData.msg || "Cloudflare Worker 数据库响应成功"
            });
          }

          lastStatusCode = response.status;
          lastErrorResponse = responseData;
        } catch (endpointErr: any) {
          // 如果是网络层直接失败（例如 DNS 错误或 connection refused），直接抛出给外层统一处理
          if (endpointErr.name !== 'AbortError' && endpointErr.cause && endpointErr.cause.code === 'ENOTFOUND') {
            throw endpointErr;
          }
          console.warn(`[CF-Auth] Endpoint ${url} returned error:`, endpointErr.message);
        }
      }

      // 如果尝试了多个端点后依然失败
      let detailedError = lastErrorResponse?.error || lastErrorResponse?.message;
      if (lastStatusCode === 404) {
        detailedError = `Worker 接口返回 404 (Not Found)。\n排查提示：\n1. 请检查您的 Worker 域名，确保包含了 .workers.dev 后缀 (例: https://xxxx.workers.dev)\n2. 确认在 Cloudflare 页面中点击了【Save and deploy / 保存并部署】。`;
      } else if (lastStatusCode === 500) {
        detailedError = lastErrorResponse?.error || `Worker 内部 500 错误。可能原因：Worker 未绑定变量名为 DB 的 D1 数据库！`;
      }

      return res.status(lastStatusCode || 400).json({
        success: false,
        status: lastStatusCode,
        error: detailedError || `Cloudflare Worker 返回异常状态 ${lastStatusCode}`
      });

    } catch (err: any) {
      const isAbort = err.name === 'AbortError';
      const causeCode = err.cause?.code || err.code || '';
      
      let hintMsg = "请检查 Worker 网址是否可以被公网访问。";
      if (causeCode === 'ENOTFOUND') {
        hintMsg = "网址域名无法解析 (ENOTFOUND)。请检查输入的 Worker 链接是否完整，例如必须包含 Cloudflare 账号二级子域名 (例: https://xxx.workers.dev)。";
      } else if (causeCode === 'ECONNREFUSED') {
        hintMsg = "拒绝连接。请确认域名为 https 并且端口正常。";
      }

      console.warn(`[CF-Auth] Proxy request failed: ${err.message} (${causeCode})`);

      return res.status(502).json({
        success: false,
        error: `连接 Cloudflare Worker 失败: ${isAbort ? '请求超时 (6秒)' : err.message}\n💡 ${hintMsg}`
      });
    }
  });

  app.get("/api/models", async (req, res) => {
    const { provider, apiKey, modelsListUrl, baseUrl } = req.query as any;
    console.log("DEBUG /api/models params:", { provider, hasApiKey: !!apiKey, modelsListUrl, baseUrl });
    if (!apiKey) return res.status(400).json({ error: "Missing API key." });
    
    try {
      let modelIds: string[] = [];

      // 1. If explicit modelsListUrl is provided
      if (modelsListUrl) {
        try {
          let headers: Record<string, string> = {};
          if (provider === 'gemini' && isGoogleUrl(modelsListUrl)) {
            headers["x-goog-api-key"] = apiKey;
          } else {
            headers["Authorization"] = `Bearer ${apiKey}`;
          }
          let fetchUrl = modelsListUrl;
          if (provider === 'gemini') {
            if (!fetchUrl.includes('pageSize=')) {
              fetchUrl += (fetchUrl.includes('?') ? '&' : '?') + 'pageSize=1000';
            }
            if (!fetchUrl.includes('key=')) {
              fetchUrl += (fetchUrl.includes('?') ? '&' : '?') + `key=${apiKey}`;
            }
          }
          const response = await fetch(fetchUrl, { headers });
          const data = await response.json();
          
          if (data.models && Array.isArray(data.models)) {
            modelIds = data.models.map((m: any) => (m.name || m.id || '').replace('models/', ''));
          } else if (data.data && Array.isArray(data.data)) {
            modelIds = data.data.map((m: any) => (m.id || m.name || '').replace('models/', ''));
          } else if (Array.isArray(data)) {
            modelIds = data.map((m: any) => typeof m === 'string' ? m : (m.id || m.name || '')).map((s: string) => s.replace('models/', ''));
          }
          if (modelIds.filter(Boolean).length > 0) {
            return res.json({ models: modelIds.filter(Boolean) });
          }
        } catch (err) {
          console.error("Fetch with custom modelsListUrl failed:", err);
        }
      }

      // 2. Gemini provider fetching logic
      if (provider === 'gemini') {
        const targetBase = baseUrl || "https://generativelanguage.googleapis.com/v1beta";
        let lastError = "";
        
        const auth = getGeminiAuth(apiKey);

        // Try Gemini REST API list endpoint directly (works with standard API keys and base URL proxies)
        try {
          let fetchUrl = `${targetBase.replace(/\/$/, '')}/models`;
          const queryParams = new URLSearchParams();
          queryParams.set("pageSize", "1000");
          if (auth.useQueryKey) {
            queryParams.set("key", auth.key);
          }
          fetchUrl += `?${queryParams.toString()}`;
          const headers: Record<string, string> = { ...auth.headers };
          const resp = await fetch(fetchUrl, { headers });
          const data = await resp.json();
          if (resp.ok && data.models && Array.isArray(data.models)) {
            modelIds = data.models.map((m: any) => m.name.replace('models/', ''));
            return res.json({ models: modelIds });
          } else if (data.error) {
            lastError = data.error.message || JSON.stringify(data.error);
          }
        } catch (e: any) {
          console.log("Gemini REST endpoint failed, trying other paths...");
          lastError = e.message || String(e);
        }

        // Try OpenAI format proxy endpoint if baseUrl was specified
        if (baseUrl) {
          try {
            const headers: Record<string, string> = {};
            if (isGoogleUrl(baseUrl)) {
              Object.assign(headers, auth.headers);
            } else {
              headers["Authorization"] = `Bearer ${apiKey}`;
            }
            let fetchUrl = `${baseUrl.replace(/\/$/, '')}/models`;
            if (isGoogleUrl(baseUrl)) {
              fetchUrl += `?pageSize=1000`;
            }
            const resp = await fetch(fetchUrl, {
              headers
            });
            const data = await resp.json();
            const list = data.data || data.models || [];
            if (resp.ok && Array.isArray(list) && list.length > 0) {
              modelIds = list.map((m: any) => (m.id || m.name || '').replace('models/', ''));
              return res.json({ models: modelIds });
            } else if (data.error) {
              lastError = data.error.message || JSON.stringify(data.error);
            }
          } catch (e: any) {
            lastError = e.message || String(e);
          }
        }

        // Fallback to GoogleGenAI SDK
        try {
          const aiOptions: any = {};
          if (auth.useQueryKey) {
            aiOptions.apiKey = auth.key;
          } else {
            aiOptions.apiKey = "placeholder_key";
            aiOptions.httpOptions = {
              fetch: (url: string | URL, init?: any) => {
                const urlStr = typeof url === 'string' ? url : url.toString();
                const cleanUrl = urlStr.replace(/[?&]key=[^&]+/, '');
                const headers = {
                  ...(init?.headers || {}),
                  "Authorization": `Bearer ${auth.key}`
                };
                delete headers["x-goog-api-key"];
                return fetch(cleanUrl, {
                  ...init,
                  headers
                });
              }
            };
          }
          const ai = new GoogleGenAI(aiOptions);
          const modelsPager = await ai.models.list({ config: { pageSize: 1000 } });
          let tempModels: string[] = [];
          if (modelsPager && Array.isArray((modelsPager as any).models)) {
            tempModels = (modelsPager as any).models.map((m: any) => m.name.replace('models/', ''));
          } else if (modelsPager) {
            for await (const m of (modelsPager as any)) {
              if (m && m.name) tempModels.push(m.name.replace('models/', ''));
            }
          }
          if (tempModels.length > 0) {
            return res.json({ models: tempModels });
          }
        } catch (sdkError: any) {
          console.error("Gemini SDK list failed:", sdkError);
          lastError = sdkError.message || String(sdkError);
        }

        // If there's an explicit authentication/invalid key error or quota error, throw it so the user knows!
        if (lastError && (
          lastError.toLowerCase().includes("key") || 
          lastError.toLowerCase().includes("invalid") || 
          lastError.toLowerCase().includes("unauthorized") || 
          lastError.toLowerCase().includes("auth") || 
          lastError.toLowerCase().includes("quota") || 
          lastError.toLowerCase().includes("limit") ||
          lastError.toLowerCase().includes("not found")
        )) {
          return res.status(400).json({ error: `Gemini 接口请求返回错误: ${lastError}` });
        }

        // Static fallback for Gemini
        return res.json({ models: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-1.5-flash", "gemini-1.5-pro", "gemini-1.0-pro"] });
      }

      // 3. OpenAI / Groq provider fetching logic
      if (provider === 'gpt' || provider === 'groq') {
        const targetBase = baseUrl || (provider === 'groq' ? "https://api.groq.com/openai/v1" : "https://api.openai.com/v1");
        let lastError = "";
        
        try {
          const url = `${targetBase.replace(/\/$/, '')}/models`;
          const response = await fetch(url, { headers: { "Authorization": `Bearer ${apiKey}` } });
          const data = await response.json();
          
          if (response.ok) {
            const modelsData = data.data || data.models || [];
            modelIds = modelsData.map((m: any) => m.id || m.name);
            if (modelIds.filter(Boolean).length > 0) {
              return res.json({ models: modelIds.filter(Boolean) });
            }
          } else if (data.error) {
            lastError = data.error.message || JSON.stringify(data.error);
          } else {
            lastError = `HTTP 错误 ${response.status}`;
          }
        } catch (e: any) {
          console.error(`Fetch models failed for ${provider}:`, e);
          lastError = e.message || String(e);
        }

        if (lastError && (
          lastError.toLowerCase().includes("key") || 
          lastError.toLowerCase().includes("invalid") || 
          lastError.toLowerCase().includes("unauthorized") || 
          lastError.toLowerCase().includes("auth") || 
          lastError.toLowerCase().includes("quota") || 
          lastError.toLowerCase().includes("limit")
        )) {
          return res.status(400).json({ error: `${provider === 'groq' ? 'Groq' : 'OpenAI'} 接口请求返回错误: ${lastError}` });
        }

        // Static fallbacks
        if (provider === 'groq') {
          return res.json({ models: ["llama-3.3-70b-versatile", "mixtral-8x7b-32768", "gemma2-9b-it"] });
        } else {
          return res.json({ models: ["gpt-4o", "gpt-4o-mini", "gpt-3.5-turbo"] });
        }
      }

      // 4. Claude provider fetching logic
      if (provider === 'claude') {
        const targetBase = baseUrl || "https://api.anthropic.com/v1";
        let lastError = "";
        try {
          const url = `${targetBase.replace(/\/$/, '')}/models`;
          const response = await fetch(url, { 
            headers: { 
              "x-api-key": apiKey,
              "anthropic-version": "2023-06-01",
              "Authorization": `Bearer ${apiKey}`
            } 
          });
          const data = await response.json();
          if (response.ok) {
            const list = data.data || data.models || [];
            if (Array.isArray(list) && list.length > 0) {
              modelIds = list.map((m: any) => m.id || m.name);
              return res.json({ models: modelIds.filter(Boolean) });
            }
          } else if (data.error) {
            lastError = data.error.message || JSON.stringify(data.error);
          } else {
            lastError = `HTTP 错误 ${response.status}`;
          }
        } catch (e: any) {
          lastError = e.message || String(e);
        }

        if (lastError && (
          lastError.toLowerCase().includes("key") || 
          lastError.toLowerCase().includes("invalid") || 
          lastError.toLowerCase().includes("unauthorized") || 
          lastError.toLowerCase().includes("auth") || 
          lastError.toLowerCase().includes("quota") || 
          lastError.toLowerCase().includes("limit")
        )) {
          return res.status(400).json({ error: `Claude 接口请求返回错误: ${lastError}` });
        }

        return res.json({ models: ["claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022", "claude-3-opus-20240229"] });
      }

      return res.json({ models: [] });
    } catch (error: any) {
      console.error(`Error fetching models for ${provider}:`, error);
      res.status(500).json({ error: error.message || "获取模型列表失败" });
    }
  });

  app.post("/api/test-model", async (req, res) => {
    const { provider, apiKey, prompt, model, baseUrl, autocompleteUrl } = req.body;
    
    if (!apiKey || !prompt) {
      return res.status(400).json({ error: "缺少 API Key 或测试提示词。" });
    }

    try {
      // If a custom baseUrl is provided, try direct HTTP fetch first to bypass client/SDK validation issues
      if (baseUrl) {
        try {
          let endpoint = baseUrl.replace(/\/$/, '');
          if (autocompleteUrl) {
            endpoint = `${endpoint}/chat/completions`;
          }

          const headers: Record<string, string> = {
            "Content-Type": "application/json"
          };

          if (provider === 'gemini' && isGoogleUrl(baseUrl)) {
            const auth = getGeminiAuth(apiKey);
            if (auth.useQueryKey) {
              headers["x-goog-api-key"] = auth.key;
            } else {
              headers["Authorization"] = `Bearer ${auth.key}`;
            }
          } else {
            headers["Authorization"] = `Bearer ${apiKey}`;
            headers["x-api-key"] = apiKey;
            headers["anthropic-version"] = "2023-06-01";
          }

          const response = await fetch(endpoint, {
            method: "POST",
            headers,
            body: JSON.stringify({
              model: model,
              messages: [{ role: "user", content: prompt }]
            })
          });

          if (response.ok) {
            const data = await response.json();
            if (data.choices && data.choices[0] && data.choices[0].message) {
              return res.json({ response: data.choices[0].message.content });
            } else if (data.content && Array.isArray(data.content) && data.content[0].text) {
              return res.json({ response: data.content[0].text });
            } else if (data.candidates && data.candidates[0] && data.candidates[0].content) {
              const parts = data.candidates[0].content.parts;
              const text = parts.map((p: any) => p.text).join('');
              return res.json({ response: text });
            } else {
              return res.json({ response: JSON.stringify(data, null, 2) });
            }
          } else {
            const errText = await response.text();
            console.warn("Direct proxy request returned error status:", response.status, errText);
          }
        } catch (proxyErr: any) {
          console.error("Direct proxy request failed, falling back to SDK...", proxyErr);
        }
      }

      // Standard SDK implementations
      if (provider === 'gemini') {
        const auth = getGeminiAuth(apiKey);
        const aiOptions: any = {};
        if (auth.useQueryKey) {
          aiOptions.apiKey = auth.key;
        } else {
          aiOptions.apiKey = "placeholder_key";
          aiOptions.httpOptions = {
            fetch: (url: string | URL, init?: any) => {
              const urlStr = typeof url === 'string' ? url : url.toString();
              const cleanUrl = urlStr.replace(/[?&]key=[^&]+/, '');
              const headers = {
                ...(init?.headers || {}),
                "Authorization": `Bearer ${auth.key}`
              };
              delete headers["x-goog-api-key"];
              return fetch(cleanUrl, {
                ...init,
                headers
              });
            }
          };
        }
        const ai = new GoogleGenAI(aiOptions);
        const response = await ai.models.generateContent({
          model: model || "gemini-2.5-flash",
          contents: prompt,
        });
        return res.json({ response: response.text });
      } else if (provider === 'gpt' || provider === 'groq') {
        const openai = new OpenAI({ 
          apiKey,
          baseURL: baseUrl || (provider === 'groq' ? "https://api.groq.com/openai/v1" : "https://api.openai.com/v1")
        });
        const response = await openai.chat.completions.create({
          model: model || (provider === 'groq' ? "llama-3.3-70b-versatile" : "gpt-4o"),
          messages: [{ role: "user", content: prompt }],
        });
        return res.json({ response: response.choices[0].message.content });
      } else if (provider === 'claude') {
        const anthropic = new Anthropic({ 
          apiKey,
          baseURL: baseUrl || "https://api.anthropic.com" 
        });
        const response = await anthropic.messages.create({
          model: model || "claude-3-5-sonnet-20241022",
          max_tokens: 1024,
          messages: [{ role: "user", content: prompt }],
        });
        // @ts-ignore
        return res.json({ response: response.content[0].text });
      } else {
        return res.status(400).json({ error: "Unsupported provider." });
      }
    } catch (error: any) {
      console.error(`Error calling ${provider} API:`, error);
      res.status(500).json({ error: error.message || "智能生成请求失败" });
    }
  });

  // ==========================================
  // OpenAI-Compatible Proxy Gateway (/v1)
  // ==========================================

  // CORS and preflight handling for /v1 routes
  app.use("/v1", (req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-api-key, anthropic-version, x-goog-api-key");
    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }
    next();
  });

  // Models listing route
  app.get("/v1/models", (req, res) => {
    const models = [
      // Gemini
      "gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-1.5-flash", "gemini-1.5-pro",
      // OpenAI
      "gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo",
      // Claude
      "claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022", "claude-3-opus-20240229",
      // Groq
      "llama-3.3-70b-versatile", "mixtral-8x7b-32768", "gemma2-9b-it"
    ];
    return res.json({
      object: "list",
      data: models.map(id => ({
        id,
        object: "model",
        created: 1700000000,
        owned_by: id.includes("gemini") || id.includes("gemma") ? "google" : id.includes("gpt") ? "openai" : id.includes("claude") ? "anthropic" : "groq"
      }))
    });
  });

  // Chat Completions routing
  app.post(["/v1/chat/completions", "/v1/:targetProvider/chat/completions"], async (req, res) => {
    const authHeader = req.headers.authorization || "";
    let apiKey = "";
    if (authHeader.startsWith("Bearer ")) {
      apiKey = authHeader.substring(7).trim();
    }
    if (!apiKey) {
      apiKey = (req.query.key as string) || (req.headers["x-api-key"] as string) || "";
    }

    if (!apiKey) {
      return res.status(401).json({
        error: {
          message: "Missing API Key. Please provide it in the Authorization header as 'Bearer YOUR_KEY'.",
          type: "invalid_request_error",
          param: null,
          code: "missing_api_key"
        }
      });
    }

    const { model, messages, temperature, max_tokens, stream, top_p } = req.body;
    let provider = req.params.targetProvider || "";

    if (!provider) {
      const modelLower = (model || "").toLowerCase();
      if (modelLower.includes("gemini") || modelLower.includes("gemma")) {
        provider = "gemini";
      } else if (modelLower.includes("gpt-") || modelLower.includes("o1-") || modelLower.includes("text-davinci")) {
        provider = "openai";
      } else if (modelLower.includes("claude")) {
        provider = "claude";
      } else if (modelLower.includes("llama") || modelLower.includes("mixtral") || modelLower.includes("gemma2-")) {
        provider = "groq";
      } else {
        provider = "gemini";
      }
    }

    console.log(`[Proxy Gateway] Routing "${model}" to "${provider}" (Stream: ${!!stream})`);

    try {
      if (provider === "openai" || provider === "gpt") {
        return await forwardOpenAICompatible("https://api.openai.com/v1", apiKey, req.body, res);
      } else if (provider === "groq") {
        return await forwardOpenAICompatible("https://api.groq.com/openai/v1", apiKey, req.body, res);
      } else if (provider === "gemini") {
        return await handleGeminiProxy(apiKey, req.body, res);
      } else if (provider === "claude") {
        return await handleClaudeProxy(apiKey, req.body, res);
      } else {
        return res.status(400).json({ error: { message: `Unsupported provider: ${provider}` } });
      }
    } catch (err: any) {
      console.error(`[Proxy Gateway Error]`, err);
      return res.status(500).json({
        error: {
          message: err.message || "Internal gateway error",
          type: "api_error"
        }
      });
    }
  });

  async function forwardOpenAICompatible(targetBase: string, apiKey: string, body: any, res: express.Response) {
    const isStream = !!body.stream;
    const response = await fetch(`${targetBase}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify(body)
    });

    res.status(response.status);
    for (const [key, value] of response.headers.entries()) {
      if (['content-type', 'cache-control', 'connection', 'transfer-encoding'].includes(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    }

    if (isStream) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
    }

    if (response.body) {
      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
    }
    res.end();
  }

  async function handleGeminiProxy(apiKey: string, body: any, res: express.Response) {
    const { model, messages, temperature, max_tokens, stream, top_p } = body;
    const targetModel = model || "gemini-2.5-flash";
    const isStream = !!stream;
    const auth = getGeminiAuth(apiKey);
    
    const systemMsgs = messages.filter((m: any) => m.role === "system");
    const nonSystemMsgs = messages.filter((m: any) => m.role !== "system");

    const contents = nonSystemMsgs.map((m: any) => {
      let role = m.role === "assistant" ? "model" : "user";
      let text = "";
      if (typeof m.content === "string") {
        text = m.content;
      } else if (Array.isArray(m.content)) {
        text = m.content.map((part: any) => part.text || "").join("\n");
      }
      return {
        role,
        parts: [{ text }]
      };
    });

    const geminiReq: any = { contents };

    if (systemMsgs.length > 0) {
      const systemText = systemMsgs.map((m: any) => m.content).join("\n");
      geminiReq.systemInstruction = {
        parts: [{ text: systemText }]
      };
    }

    const generationConfig: any = {};
    if (temperature !== undefined) generationConfig.temperature = temperature;
    if (max_tokens !== undefined) generationConfig.maxOutputTokens = max_tokens;
    if (top_p !== undefined) generationConfig.topP = top_p;

    if (Object.keys(generationConfig).length > 0) {
      geminiReq.generationConfig = generationConfig;
    }

    const endpointAction = isStream ? "streamGenerateContent" : "generateContent";
    let fetchUrl = `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:${endpointAction}`;
    
    const queryParams = new URLSearchParams();
    if (isStream) {
      queryParams.set("alt", "sse");
    }
    if (auth.useQueryKey) {
      queryParams.set("key", auth.key);
    }
    if (queryParams.toString()) {
      fetchUrl += `?${queryParams.toString()}`;
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...auth.headers
    };

    const response = await fetch(fetchUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(geminiReq)
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({
        error: {
          message: `Gemini API returned error: ${errText}`,
          type: "api_error"
        }
      });
    }

    const chatId = `chatcmpl-${Math.random().toString(36).substring(2, 15)}`;
    const createdTime = Math.floor(Date.now() / 1000);

    if (!isStream) {
      const data = await response.json();
      let text = "";
      if (data.candidates && data.candidates[0] && data.candidates[0].content) {
        text = data.candidates[0].content.parts.map((p: any) => p.text).join("");
      }
      return res.json({
        id: chatId,
        object: "chat.completion",
        created: createdTime,
        model: targetModel,
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: text
            },
            finish_reason: "stop"
          }
        ]
      });
    } else {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      if (!response.body) {
        res.write("data: [DONE]\n\n");
        return res.end();
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const cleanLine = line.trim();
            if (!cleanLine.startsWith("data: ")) continue;
            const jsonStr = cleanLine.substring(6).trim();
            if (!jsonStr) continue;
            
            try {
              const parsed = JSON.parse(jsonStr);
              let chunkText = "";
              if (parsed.candidates && parsed.candidates[0] && parsed.candidates[0].content) {
                chunkText = parsed.candidates[0].content.parts.map((p: any) => p.text).join("");
              }
              
              if (chunkText) {
                const sseChunk = {
                  id: chatId,
                  object: "chat.completion.chunk",
                  created: createdTime,
                  model: targetModel,
                  choices: [
                    {
                      index: 0,
                      delta: { content: chunkText },
                      finish_reason: null
                    }
                  ]
                };
                res.write(`data: ${JSON.stringify(sseChunk)}\n\n`);
              }
            } catch (err) {
              // Ignore partial parsing errors
            }
          }
        }
      } catch (e) {
        console.error("Streaming error in proxy:", e);
      } finally {
        const finalChunk = {
          id: chatId,
          object: "chat.completion.chunk",
          created: createdTime,
          model: targetModel,
          choices: [
            {
              index: 0,
              delta: {},
              finish_reason: "stop"
            }
          ]
        };
        res.write(`data: ${JSON.stringify(finalChunk)}\n\n`);
        res.write("data: [DONE]\n\n");
        res.end();
      }
    }
  }

  async function handleClaudeProxy(apiKey: string, body: any, res: express.Response) {
    const { model, messages, temperature, max_tokens } = body;
    const targetModel = model || "claude-3-5-sonnet-20241022";
    
    const systemMsgs = messages.filter((m: any) => m.role === "system");
    const nonSystemMsgs = messages.filter((m: any) => m.role !== "system");

    const claudeReq: any = {
      model: targetModel,
      max_tokens: max_tokens || 1024,
      messages: nonSystemMsgs.map((m: any) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content
      }))
    };

    if (systemMsgs.length > 0) {
      claudeReq.system = systemMsgs.map((m: any) => m.content).join("\n");
    }

    if (temperature !== undefined) claudeReq.temperature = temperature;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify(claudeReq)
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({
        error: {
          message: `Claude API returned error: ${errText}`,
          type: "api_error"
        }
      });
    }

    const data = await response.json();
    const text = data.content && data.content[0] ? data.content[0].text : "";
    
    const chatId = `chatcmpl-${Math.random().toString(36).substring(2, 15)}`;
    return res.json({
      id: chatId,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: targetModel,
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: text
          },
          finish_reason: "stop"
        }
      ]
    });
  }

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
