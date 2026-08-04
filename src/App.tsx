/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { useState, useEffect, useMemo, useRef, FormEvent } from 'react';
import { 
  Eye, 
  EyeOff, 
  Save, 
  Trash2, 
  RefreshCw, 
  Sparkles, 
  Cpu, 
  ShieldCheck, 
  Zap, 
  Copy, 
  Check, 
  Search,
  MessageSquare,
  Clock,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Play,
  Square,
  ListChecks,
  CheckCircle,
  AlertCircle,
  FileText,
  X,
  Layers,
  Database,
  Cloud,
  Globe,
  Server,
  Link2,
  ChevronDown,
  ChevronUp,
  FileCode
} from 'lucide-react';

export interface SingleTestResult {
  model: string;
  status: 'pending' | 'testing' | 'success' | 'error';
  response?: string;
  error?: string;
  time?: number;
}

interface ProviderConfig {
  apiKey: string;
  modelsListUrl: string;
  baseUrl: string;
  autocompleteUrl: boolean;
  availableModels: string[];
  selectedModelId: string;
}

const MODELS = [
  {
    id: 'gemini',
    name: 'Google Gemini',
    description: '先进的多模态 AI 模型。',
    icon: Sparkles,
    colorClass: 'text-indigo-600 bg-indigo-50 border-indigo-100',
    activeColorClass: 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-100',
    hoverColorClass: 'hover:bg-indigo-50 text-indigo-700 hover:border-indigo-200',
    keyPlaceholder: '输入 Gemini API Key (AIzaSy...)',
    modelsUrlPlaceholder: '例如：https://generativelanguage.googleapis.com/v1beta/models',
    baseUrlPlaceholder: '例如：https://generativelanguage.googleapis.com/v1beta'
  },
  {
    id: 'gpt',
    name: 'OpenAI GPT',
    description: '用于各种任务的大型语言模型。',
    icon: Cpu,
    colorClass: 'text-emerald-600 bg-emerald-50 border-emerald-100',
    activeColorClass: 'bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-100',
    hoverColorClass: 'hover:bg-emerald-50 text-emerald-700 hover:border-emerald-200',
    keyPlaceholder: '输入 OpenAI API Key (sk-...)',
    modelsUrlPlaceholder: '例如：https://api.openai.com/v1/models',
    baseUrlPlaceholder: '例如：https://api.openai.com/v1'
  },
  {
    id: 'claude',
    name: 'Anthropic Claude',
    description: '专注于安全和有益的 AI 模型。',
    icon: ShieldCheck,
    colorClass: 'text-amber-600 bg-amber-50 border-amber-100',
    activeColorClass: 'bg-amber-600 text-white border-amber-600 shadow-md shadow-amber-100',
    hoverColorClass: 'hover:bg-amber-50 text-amber-700 hover:border-amber-200',
    keyPlaceholder: '输入 Claude API Key (sk-ant-...)',
    modelsUrlPlaceholder: '例如：https://api.anthropic.com/v1/models',
    baseUrlPlaceholder: '例如：https://api.anthropic.com/v1'
  },
  {
    id: 'groq',
    name: 'Groq',
    description: '基于 LPU 的高速推理引擎。',
    icon: Zap,
    colorClass: 'text-orange-600 bg-orange-50 border-orange-100',
    activeColorClass: 'bg-orange-600 text-white border-orange-600 shadow-md shadow-orange-100',
    hoverColorClass: 'hover:bg-orange-50 text-orange-700 hover:border-orange-200',
    keyPlaceholder: '输入 Groq API Key (gsk_...)',
    modelsUrlPlaceholder: '例如：https://api.groq.com/v1/models',
    baseUrlPlaceholder: '例如：https://api.groq.com/openai/v1'
  }
];

const DEFAULT_CONFIGS: Record<string, ProviderConfig> = {
  gemini: { apiKey: '', modelsListUrl: '', baseUrl: '', autocompleteUrl: true, availableModels: [], selectedModelId: '' },
  gpt: { apiKey: '', modelsListUrl: '', baseUrl: '', autocompleteUrl: true, availableModels: [], selectedModelId: '' },
  claude: { apiKey: '', modelsListUrl: '', baseUrl: '', autocompleteUrl: true, availableModels: [], selectedModelId: '' },
  groq: { apiKey: '', modelsListUrl: '', baseUrl: '', autocompleteUrl: true, availableModels: [], selectedModelId: '' }
};

const DEFAULT_MODELS: Record<string, string[]> = {
  gemini: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-1.5-flash", "gemini-1.5-pro", "gemini-2.0-flash-exp", "gemini-1.0-pro"],
  gpt: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"],
  claude: ["claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022", "claude-3-opus-20240229"],
  groq: ["llama-3.3-70b-versatile", "mixtral-8x7b-32768", "gemma2-9b-it"]
};

export default function App() {
  const [selectedModel, setSelectedModel] = useState(MODELS[0]);
  const [showKey, setShowKey] = useState(false);
  const [prompt, setPrompt] = useState('你好！请回复确认当前模型可用。');
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [copied, setCopied] = useState(false);
  const [copiedBaseUrl, setCopiedBaseUrl] = useState(false);
  const [copiedCurlCommand, setCopiedCurlCommand] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [keySaveNotice, setKeySaveNotice] = useState(false);

  // Auth state - 100% Cloudflare D1 Database Worker API
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    return localStorage.getItem('app_logged_in') === 'true';
  });

  // Cloudflare Workers Auth & Database State
  const [cfWorkerUrl, setCfWorkerUrl] = useState(() => {
    return localStorage.getItem('cf_worker_url') || '';
  });
  const [cfUsername, setCfUsername] = useState('');
  const [cfPassword, setCfPassword] = useState('');
  const [cfNotice, setCfNotice] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [isCfTesting, setIsCfTesting] = useState(false);
  const [isCfAuthenticating, setIsCfAuthenticating] = useState(false);
  const [showWorkerGuide, setShowWorkerGuide] = useState(false);
  const [copiedWorkerCode, setCopiedWorkerCode] = useState(false);
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  // Change credentials form state (100% Cloudflare D1 Worker)
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [oldPasswordInput, setOldPasswordInput] = useState('');
  const [newUsernameInput, setNewUsernameInput] = useState('');
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState('');
  const [changePassError, setChangePassError] = useState('');
  const [changePassSuccess, setChangePassSuccess] = useState('');

  const requestCloudflareWorker = async (workerUrl: string, payload: any) => {
    // 1. Try Express backend proxy first (/api/cf-auth)
    try {
      const res = await fetch('/api/cf-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workerUrl,
          ...payload
        })
      });
      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        const data = await res.json();
        return { ok: true, data };
      }
    } catch (e) {
      // Fallback to direct fetch
    }

    // 2. Fallback: Direct fetch to Cloudflare Worker URL (supports static hosting / GitHub Pages)
    try {
      const directRes = await fetch(workerUrl.trim(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const directData = await directRes.json();
      return { ok: directRes.ok, data: directData };
    } catch (err: any) {
      return { ok: false, data: { success: false, error: err.message || '网络连接或跨域请求失败' } };
    }
  };

  const handleCfLogin = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    const url = cfWorkerUrl.trim();
    if (!url) {
      setCfNotice({ type: 'error', text: '请填写 Cloudflare Worker 数据库 API 地址' });
      return;
    }
    if (url.includes('dash.cloudflare.com')) {
      setCfNotice({ type: 'error', text: '您填写的 URL 是 Cloudflare 控制台管理网址！\n请复制 Worker 部署后生成的公共服务链接 (通常以 .workers.dev 结尾)' });
      return;
    }
    if (url.includes('you.workers.dev') || url.includes('example.com')) {
      setCfNotice({ type: 'error', text: '请填写您在 Cloudflare 部署的实际 Worker 数据库 API 地址' });
      return;
    }
    if (!cfUsername.trim() || !cfPassword.trim()) {
      setCfNotice({ type: 'error', text: '请输入 Cloudflare 数据库验证账号与密码' });
      return;
    }

    setIsCfAuthenticating(true);
    setCfNotice({ type: 'info', text: '正在验证 Cloudflare Worker 数据库响应...' });

    try {
      const { ok, data } = await requestCloudflareWorker(url, {
        username: cfUsername.trim(),
        password: cfPassword.trim(),
        action: 'login'
      });

      if (ok && data.success) {
        localStorage.setItem('cf_worker_url', url);
        localStorage.setItem('cf_authenticated_user', cfUsername.trim());
        localStorage.setItem('app_logged_in', 'true');
        setIsLoggedIn(true);
        setCfNotice({ type: 'success', text: 'Cloudflare 数据库登录成功！' });
      } else {
        setCfNotice({ 
          type: 'error', 
          text: data.error || 'Cloudflare 数据库验证失败，请核对 API 地址及凭证' 
        });
      }
    } catch (err: any) {
      setCfNotice({ 
        type: 'error', 
        text: `连接异常: ${err.message || '网络断开或端点无法访问'}` 
      });
    } finally {
      setIsCfAuthenticating(false);
    }
  };

  const handleTestCfConnection = async () => {
    const url = cfWorkerUrl.trim();
    if (!url) {
      setCfNotice({ type: 'error', text: '请填写 Cloudflare Worker 数据库 API 地址' });
      return;
    }
    if (url.includes('dash.cloudflare.com')) {
      setCfNotice({ type: 'error', text: '您填写的 URL 是 Cloudflare 控制台管理网址！\n请复制 Worker 部署后生成的公共服务链接' });
      return;
    }
    if (url.includes('you.workers.dev') || url.includes('example.com')) {
      setCfNotice({ type: 'error', text: '请填写您在 Cloudflare 部署的实际 Worker 数据库 API 地址' });
      return;
    }
    setIsCfTesting(true);
    setCfNotice({ type: 'info', text: '正在测试与 Cloudflare Worker 数据库 API 的连接...' });

    try {
      const { ok, data } = await requestCloudflareWorker(url, {
        username: cfUsername.trim() || 'test',
        password: cfPassword.trim() || 'test',
        action: 'ping'
      });

      if (ok && data.success) {
        localStorage.setItem('cf_worker_url', url);
        setCfNotice({ 
          type: 'success', 
          text: `Cloudflare 数据库 API 联通正常！(${data.message || 'Worker 响应成功'})` 
        });
      } else {
        setCfNotice({ 
          type: 'error', 
          text: data.error || 'Cloudflare 数据库端点响应不符合规范' 
        });
      }
    } catch (err: any) {
      setCfNotice({ 
        type: 'error', 
        text: `建立连接失败: ${err.message || '超时或无效域名'}` 
      });
    } finally {
      setIsCfTesting(false);
    }
  };

  const handleChangeCredentials = async (e: FormEvent) => {
    e.preventDefault();
    const url = cfWorkerUrl.trim();
    if (!url) {
      setChangePassError('请先填写 Cloudflare Worker 数据库 API 地址');
      setChangePassSuccess('');
      return;
    }
    const oldPass = oldPasswordInput.trim();
    if (!oldPass) {
      setChangePassError('请输入当前原密码进行校验');
      setChangePassSuccess('');
      return;
    }
    const nextUser = newUsernameInput.trim();
    if (!nextUser) {
      setChangePassError('新账号不能为空');
      setChangePassSuccess('');
      return;
    }

    let nextPass = oldPass;
    if (newPasswordInput.trim() || confirmPasswordInput.trim()) {
      if (newPasswordInput !== confirmPasswordInput) {
        setChangePassError('两次输入的新密码不一致');
        setChangePassSuccess('');
        return;
      }
      nextPass = newPasswordInput.trim();
      if (!nextPass) {
        setChangePassError('新密码不能为空');
        setChangePassSuccess('');
        return;
      }
    }

    setIsCfAuthenticating(true);
    setChangePassError('');
    setChangePassSuccess('');

    try {
      const { ok, data } = await requestCloudflareWorker(url, {
        username: cfUsername.trim() || nextUser,
        password: oldPass,
        oldPassword: oldPass,
        newAccount: nextUser,
        newPassword: nextPass,
        action: 'change'
      });

      if (ok && data.success) {
        setChangePassSuccess('Cloudflare D1 数据库账号与密码更新成功！');
        setCfUsername(nextUser);
        setCfPassword(nextPass);
        setOldPasswordInput('');
        setNewUsernameInput('');
        setNewPasswordInput('');
        setConfirmPasswordInput('');
        setTimeout(() => {
          setIsChangingPassword(false);
          setChangePassSuccess('');
        }, 1500);
      } else {
        setChangePassError(data.error || 'D1 数据库凭证更新失败，请核对原密码');
      }
    } catch (err: any) {
      setChangePassError(`修改请求网络异常: ${err.message || '无法连接 D1 数据库 API'}`);
    } finally {
      setIsCfAuthenticating(false);
    }
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    localStorage.removeItem('app_logged_in');
  };

  // Per-provider single test results
  const [singleTestByProvider, setSingleTestByProvider] = useState<Record<string, { response: string; testTime: number | null }>>({});

  // Per-provider batch test results
  const [batchResultsByProvider, setBatchResultsByProvider] = useState<Record<string, Record<string, SingleTestResult>>>({});

  // Per-provider view mode
  const [testViewModeByProvider, setTestViewModeByProvider] = useState<Record<string, 'single' | 'batch'>>({});

  // Active batch testing provider ID
  const [batchTestingProvider, setBatchTestingProvider] = useState<string | null>(null);

  const [batchFilter, setBatchFilter] = useState<'all' | 'success' | 'error'>('all');
  const [batchSearch, setBatchSearch] = useState('');
  const [selectedModalResult, setSelectedModalResult] = useState<SingleTestResult | null>(null);
  const stopBatchRef = useRef(false);

  // Load all configs from localStorage or migrate legacy single-keys
  const [configs, setConfigs] = useState<Record<string, ProviderConfig>>(() => {
    let initial = { ...DEFAULT_CONFIGS };
    const saved = localStorage.getItem('model_platform_configs');
    if (saved) {
      try {
        initial = JSON.parse(saved);
      } catch (e) {}
    }
    
    // Safety check & Legacy migration
    MODELS.forEach(m => {
      if (!initial[m.id]) {
        initial[m.id] = { ...DEFAULT_CONFIGS[m.id] };
      }
      // Migrate legacy key if present
      const legacyKey = localStorage.getItem(`apiKey_${m.id}`);
      if (legacyKey && !initial[m.id].apiKey) {
        initial[m.id].apiKey = legacyKey;
      }
    });
    return initial;
  });

  // Current active configuration
  const activeConfig = useMemo(() => {
    return configs[selectedModel.id] || DEFAULT_CONFIGS[selectedModel.id];
  }, [configs, selectedModel.id]);

  // Computed models actually shown to the user (empty if not fetched)
  const activeModelList = useMemo(() => {
    return activeConfig.availableModels || [];
  }, [activeConfig.availableModels]);

  // Computed selected model ID (handles default fallback selection)
  const currentSelectedModelId = useMemo(() => {
    return activeConfig.selectedModelId || activeModelList[0] || '';
  }, [activeConfig.selectedModelId, activeModelList]);

  // Update a configuration property
  const updateConfig = (updates: Partial<ProviderConfig>) => {
    setConfigs(prev => {
      const next = {
        ...prev,
        [selectedModel.id]: {
          ...prev[selectedModel.id],
          ...updates
        }
      };
      localStorage.setItem('model_platform_configs', JSON.stringify(next));
      return next;
    });
  };

  // Current active provider ID
  const currentProviderId = selectedModel.id;

  // Active provider single test result
  const currentSingleTest = singleTestByProvider[currentProviderId] || { response: '', testTime: null };
  const response = currentSingleTest.response;
  const testTime = currentSingleTest.testTime;

  // Active provider batch test results & view mode
  const batchResults = useMemo(() => batchResultsByProvider[currentProviderId] || {}, [batchResultsByProvider, currentProviderId]);
  const testViewMode = testViewModeByProvider[currentProviderId] || 'single';
  const batchTesting = batchTestingProvider === currentProviderId;

  // Helpers to update provider specific test state
  const setSingleTestResult = (providerId: string, resp: string, time: number | null) => {
    setSingleTestByProvider(prev => ({
      ...prev,
      [providerId]: { response: resp, testTime: time }
    }));
  };

  const setTestViewMode = (mode: 'single' | 'batch', providerId = currentProviderId) => {
    setTestViewModeByProvider(prev => ({
      ...prev,
      [providerId]: mode
    }));
  };

  // Keep local input field in sync with saved key when switching provider or when saved key updates
  useEffect(() => {
    setApiKeyInput(activeConfig.apiKey || '');
    setFetchError('');
    setSelectedModalResult(null);
  }, [selectedModel.id, activeConfig.apiKey]);

  const handleSaveKey = () => {
    const trimmed = apiKeyInput.trim();
    if (!trimmed) return;
    localStorage.setItem(`apiKey_${selectedModel.id}`, trimmed);
    updateConfig({ apiKey: trimmed });
    setKeySaveNotice(true);
    setTimeout(() => setKeySaveNotice(false), 2000);
  };

  const handleClearKey = () => {
    localStorage.removeItem(`apiKey_${selectedModel.id}`);
    updateConfig({ 
      apiKey: '', 
      availableModels: [], 
      selectedModelId: '' 
    });
    setApiKeyInput('');
    setSingleTestResult(selectedModel.id, '', null);
    setBatchResultsByProvider(prev => {
      const next = { ...prev };
      delete next[selectedModel.id];
      return next;
    });
    setFetchError('');
  };

  const fetchModels = async () => {
    if (!activeConfig.apiKey) {
      setFetchError('请先点击『保存 Key』保存密钥后再点击刷新获取模型列表。');
      return;
    }
    setLoading(true);
    setSingleTestResult(selectedModel.id, '', null);
    setFetchError('');
    try {
      const queryParams = new URLSearchParams({
        provider: selectedModel.id,
        apiKey: activeConfig.apiKey,
        ...(activeConfig.baseUrl && { baseUrl: activeConfig.baseUrl }),
        ...(activeConfig.modelsListUrl && { modelsListUrl: activeConfig.modelsListUrl })
      });
      
      const res = await fetch(`/api/models?${queryParams.toString()}`);
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "获取列表接口返回错误");
      }
      const data = await res.json();
      const modelsList = data.models || [];
      
      updateConfig({ 
        availableModels: modelsList,
        selectedModelId: modelsList.length > 0 ? modelsList[0] : ''
      });
    } catch (e: any) {
      console.error("Error fetching models:", e);
      setFetchError(e.message || "未知接口请求错误");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!activeConfig.apiKey || !prompt || !currentSelectedModelId) return;
    const providerId = selectedModel.id;
    setTesting(true);
    setTestViewMode('single', providerId);
    setSingleTestResult(providerId, '', null);
    const startTime = Date.now();
    
    try {
      const res = await fetch("/api/test-model", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          provider: providerId, 
          apiKey: activeConfig.apiKey, 
          prompt,
          model: currentSelectedModelId,
          baseUrl: activeConfig.baseUrl,
          autocompleteUrl: activeConfig.autocompleteUrl
        }),
      });
      const data = await res.json();
      setSingleTestResult(providerId, data.response || data.error || "未知响应", (Date.now() - startTime) / 1000);
    } catch (e) {
      setSingleTestResult(providerId, "错误: 无法连接到服务器 API.", null);
    } finally {
      setTesting(false);
    }
  };

  const handleBatchTest = async () => {
    const providerId = selectedModel.id;
    const modelsToTest = activeModelList.length > 0 ? activeModelList : [];
    if (modelsToTest.length === 0) {
      setFetchError('请先刷新/获取模型列表后再进行一键全模型测试。');
      return;
    }
    if (!activeConfig.apiKey) {
      setFetchError('请先点击『保存 Key』保存密钥后再进行测试。');
      return;
    }
    if (!prompt) return;

    setBatchTestingProvider(providerId);
    setTestViewMode('batch', providerId);
    stopBatchRef.current = false;

    // Reset / Initialize batchResults map for this provider
    const initialMap: Record<string, SingleTestResult> = {};
    modelsToTest.forEach(m => {
      initialMap[m] = { model: m, status: 'pending' };
    });
    setBatchResultsByProvider(prev => ({
      ...prev,
      [providerId]: initialMap
    }));

    const CONCURRENCY = 3;
    let index = 0;

    const updateProviderModelResult = (pId: string, modelName: string, item: SingleTestResult) => {
      setBatchResultsByProvider(prev => ({
        ...prev,
        [pId]: {
          ...(prev[pId] || {}),
          [modelName]: item
        }
      }));
    };

    const worker = async () => {
      while (index < modelsToTest.length && !stopBatchRef.current) {
        const curIdx = index++;
        const modelName = modelsToTest[curIdx];

        updateProviderModelResult(providerId, modelName, { model: modelName, status: 'testing' });

        const startTime = Date.now();
        try {
          const res = await fetch("/api/test-model", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
              provider: providerId, 
              apiKey: activeConfig.apiKey, 
              prompt,
              model: modelName,
              baseUrl: activeConfig.baseUrl,
              autocompleteUrl: activeConfig.autocompleteUrl
            }),
          });

          const elapsed = (Date.now() - startTime) / 1000;
          const data = await res.json();

          if (res.ok && data.response && !data.error) {
            updateProviderModelResult(providerId, modelName, {
              model: modelName,
              status: 'success',
              response: data.response,
              time: elapsed
            });
          } else {
            updateProviderModelResult(providerId, modelName, {
              model: modelName,
              status: 'error',
              error: data.error || data.response || "请求出错",
              time: elapsed
            });
          }
        } catch (e: any) {
          const elapsed = (Date.now() - startTime) / 1000;
          updateProviderModelResult(providerId, modelName, {
            model: modelName,
            status: 'error',
            error: e.message || "无法连接到服务器",
            time: elapsed
          });
        }
      }
    };

    const workers = Array.from({ length: Math.min(CONCURRENCY, modelsToTest.length) }, () => worker());
    await Promise.all(workers);
    setBatchTestingProvider(prev => (prev === providerId ? null : prev));
  };

  const stopBatchTest = () => {
    stopBatchRef.current = true;
    setBatchTestingProvider(null);
  };

  const handleTestSingleInBatch = async (modelName: string) => {
    if (!activeConfig.apiKey || !prompt) return;
    const providerId = selectedModel.id;

    const updateProviderModelResult = (pId: string, mName: string, item: SingleTestResult) => {
      setBatchResultsByProvider(prev => ({
        ...prev,
        [pId]: {
          ...(prev[pId] || {}),
          [mName]: item
        }
      }));
    };

    updateProviderModelResult(providerId, modelName, { model: modelName, status: 'testing' });

    const startTime = Date.now();
    try {
      const res = await fetch("/api/test-model", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          provider: providerId, 
          apiKey: activeConfig.apiKey, 
          prompt,
          model: modelName,
          baseUrl: activeConfig.baseUrl,
          autocompleteUrl: activeConfig.autocompleteUrl
        }),
      });

      const elapsed = (Date.now() - startTime) / 1000;
      const data = await res.json();

      if (res.ok && data.response && !data.error) {
        updateProviderModelResult(providerId, modelName, {
          model: modelName,
          status: 'success',
          response: data.response,
          time: elapsed
        });
      } else {
        updateProviderModelResult(providerId, modelName, {
          model: modelName,
          status: 'error',
          error: data.error || data.response || "请求出错",
          time: elapsed
        });
      }
    } catch (e: any) {
      const elapsed = (Date.now() - startTime) / 1000;
      updateProviderModelResult(providerId, modelName, {
        model: modelName,
        status: 'error',
        error: e.message || "无法连接到服务器",
        time: elapsed
      });
    }
  };

  const batchArray = useMemo(() => Object.values(batchResults), [batchResults]);
  const batchStats = useMemo(() => {
    let total = batchArray.length;
    let completed = 0;
    let success = 0;
    let error = 0;
    let testingCount = 0;
    let pending = 0;

    batchArray.forEach(item => {
      if (item.status === 'success') { success++; completed++; }
      else if (item.status === 'error') { error++; completed++; }
      else if (item.status === 'testing') { testingCount++; }
      else { pending++; }
    });

    return { total, completed, success, error, testingCount, pending };
  }, [batchArray]);

  const filteredBatchResults = useMemo(() => {
    return batchArray.filter(item => {
      if (batchFilter === 'success' && item.status !== 'success') return false;
      if (batchFilter === 'error' && item.status !== 'error') return false;
      if (batchSearch.trim() && !item.model.toLowerCase().includes(batchSearch.toLowerCase())) return false;
      return true;
    });
  }, [batchArray, batchFilter, batchSearch]);

  const copyToClipboard = () => {
    if (!response) return;
    navigator.clipboard.writeText(response);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copyBaseUrl = () => {
    const url = `${window.location.origin}/v1`;
    navigator.clipboard.writeText(url);
    setCopiedBaseUrl(true);
    setTimeout(() => setCopiedBaseUrl(false), 2000);
  };

  const copyCurlCommand = () => {
    const url = `${window.location.origin}/v1/chat/completions`;
    const modelName = currentSelectedModelId || 'gemini-2.5-flash';
    const key = activeConfig.apiKey ? activeConfig.apiKey : 'YOUR_API_KEY';
    const cmd = `curl ${url} \\\n  -H "Content-Type: application/json" \\\n  -H "Authorization: Bearer ${key}" \\\n  -d '{\n    "model": "${modelName}",\n    "messages": [{"role": "user", "content": "你好！"}]\n  }'`;
    navigator.clipboard.writeText(cmd);
    setCopiedCurlCommand(true);
    setTimeout(() => setCopiedCurlCommand(false), 2000);
  };

  // Filter models based on search query
  const filteredModels = useMemo(() => {
    if (!searchQuery.trim()) return activeModelList;
    return activeModelList.filter(m => m.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [activeModelList, searchQuery]);

  const IconComponent = selectedModel.icon;
  const isKeySaved = activeConfig.apiKey.trim().length > 0;

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-[#fafafb] flex items-center justify-center p-4 font-sans text-neutral-800 antialiased">
        <div className="w-full max-w-md bg-white rounded-2xl border border-neutral-200/80 shadow-xl overflow-hidden animate-fadeIn">
          {/* Header decoration */}
          <div className="p-8 pb-6 border-b border-neutral-100 bg-gradient-to-br from-neutral-900 to-neutral-800 text-white">
            <div className="w-12 h-12 rounded-2xl bg-purple-600 flex items-center justify-center text-white shadow-lg shadow-purple-900/40 mb-4">
              <Cloud size={26} />
            </div>
            <h2 className="text-2xl font-bold tracking-tight">
              {isChangingPassword ? "修改 D1 数据库账号密码" : "Cloudflare D1 数据库登录"}
            </h2>
            <p className="text-xs text-neutral-300 mt-1.5">
              {isChangingPassword 
                ? "验证原密码并直接同步修改 Cloudflare D1 数据库凭证" 
                : "请连接并验证您的 Cloudflare D1 (xs) 数据库访问凭证"}
            </p>
          </div>

          {!isChangingPassword ? (
            /* Cloudflare Worker Login Form */
            <form onSubmit={handleCfLogin} className="p-7 space-y-4">
              {cfNotice && (
                <div className={`p-3 rounded-xl text-xs font-semibold flex items-center gap-2 border ${
                  cfNotice.type === 'success' 
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-700' 
                    : cfNotice.type === 'info'
                    ? 'bg-purple-50 border-purple-200 text-purple-700'
                    : 'bg-rose-50 border-rose-200 text-rose-700'
                }`}>
                  {cfNotice.type === 'success' ? (
                    <CheckCircle size={16} className="shrink-0 text-emerald-500" />
                  ) : cfNotice.type === 'info' ? (
                    <RefreshCw size={16} className="shrink-0 text-purple-500 animate-spin" />
                  ) : (
                    <AlertCircle size={16} className="shrink-0 text-rose-500" />
                  )}
                  <span className="break-all whitespace-pre-line">{cfNotice.text}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-neutral-600 uppercase tracking-wider block flex items-center gap-1.5">
                    <Cloud size={13} className="text-purple-600" />
                    Cloudflare Worker 数据库 API
                  </label>
                  <span className="text-[10px] text-purple-600 bg-purple-50 px-2 py-0.5 rounded-md font-mono font-semibold">D1 (xs)</span>
                </div>
                <div className="relative">
                  <input
                    type="text"
                    required
                    className="w-full pl-3.5 pr-9 py-2.5 bg-neutral-50/50 border border-neutral-200 hover:border-neutral-300 focus:border-neutral-900 focus:bg-white rounded-xl outline-none text-xs transition font-mono font-medium"
                    placeholder="https://xs-auth.your-subdomain.workers.dev"
                    value={cfWorkerUrl}
                    onChange={(e) => {
                      setCfWorkerUrl(e.target.value);
                      setCfNotice(null);
                    }}
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400">
                    <Globe size={15} />
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-neutral-600 uppercase tracking-wider block">
                  数据库验证账号 (Account)
                </label>
                <input
                  type="text"
                  required
                  className="w-full px-3.5 py-2.5 bg-neutral-50/50 border border-neutral-200 hover:border-neutral-300 focus:border-neutral-900 focus:bg-white rounded-xl outline-none text-sm transition font-medium"
                  placeholder="请输入数据库管理员账号"
                  value={cfUsername}
                  onChange={(e) => {
                    setCfUsername(e.target.value);
                    setCfNotice(null);
                  }}
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-neutral-600 uppercase tracking-wider block">
                    数据库密码 / 密钥 (Password)
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setIsChangingPassword(true);
                      setNewUsernameInput(cfUsername);
                      setCfNotice(null);
                    }}
                    className="text-xs text-purple-600 hover:text-purple-700 font-semibold cursor-pointer"
                  >
                    修改数据库账号密码？
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showLoginPassword ? "text" : "password"}
                    required
                    className="w-full pl-3.5 pr-12 py-2.5 bg-neutral-50/50 border border-neutral-200 hover:border-neutral-300 focus:border-neutral-900 focus:bg-white rounded-xl outline-none text-sm transition font-medium"
                    placeholder="请输入数据库密码或密钥"
                    value={cfPassword}
                    onChange={(e) => {
                      setCfPassword(e.target.value);
                      setCfNotice(null);
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowLoginPassword(!showLoginPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600 transition cursor-pointer"
                  >
                    {showLoginPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div className="pt-2 space-y-2">
                <button
                  type="submit"
                  disabled={isCfAuthenticating || isCfTesting}
                  className="w-full py-3 px-6 bg-purple-600 hover:bg-purple-700 active:bg-purple-800 disabled:bg-neutral-300 text-white font-bold text-sm rounded-xl transition duration-150 shadow-md shadow-purple-200 flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isCfAuthenticating ? (
                    <RefreshCw size={17} className="animate-spin" />
                  ) : (
                    <Cloud size={17} />
                  )}
                  <span>{isCfAuthenticating ? '正在通过 Cloudflare D1 验证...' : 'Cloudflare 数据库登录'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleTestCfConnection}
                  disabled={isCfAuthenticating || isCfTesting}
                  className="w-full py-2.5 px-6 bg-purple-50 hover:bg-purple-100 text-purple-700 font-semibold text-xs rounded-xl border border-purple-200/80 transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isCfTesting ? (
                    <RefreshCw size={14} className="animate-spin text-purple-600" />
                  ) : (
                    <Database size={14} />
                  )}
                  <span>测试数据库 API 连通性</span>
                </button>
              </div>

              <div className="border border-purple-100 rounded-xl bg-purple-50/40 p-3 text-xs space-y-2 mt-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-bold text-purple-900">
                    <FileCode size={15} className="text-purple-600" />
                    <span>Cloudflare D1 数据库 (xs) 绑定指南</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowWorkerGuide(!showWorkerGuide)}
                    className="text-purple-700 hover:text-purple-900 font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <span>{showWorkerGuide ? '收起指南' : '部署教程 & 源码'}</span>
                    {showWorkerGuide ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                </div>

                {showWorkerGuide && (
                  <div className="pt-2 border-t border-purple-200/60 space-y-2.5 text-[11px] text-neutral-700">
                    <div className="bg-white p-2.5 rounded-lg border border-purple-200/80 space-y-1">
                      <p className="font-bold text-neutral-800">D1 数据库设置核心要点：</p>
                      <ol className="list-decimal list-inside space-y-1 text-neutral-600 pl-0.5">
                        <li>与在线 D1 数据库 <code className="bg-purple-100 px-1 py-0.5 rounded text-purple-800 font-mono font-bold">xs</code> 的 <code className="bg-purple-100 px-1 py-0.5 rounded text-purple-800 font-mono font-bold">auth_credentials</code> 数据表通信。</li>
                        <li>Worker 【设置】➜【变量与绑定】中，变量名称填 <code className="bg-purple-100 px-1 py-0.5 rounded text-purple-800 font-mono font-bold">DB</code>。</li>
                        <li>粘贴 Worker 部署网址即可全网多端同步鉴权！</li>
                      </ol>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-neutral-800">Worker 模块代码 (worker.js):</span>
                        <button
                          type="button"
                          onClick={() => {
                            const code = `export default {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json; charset=utf-8",
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
    if (!env || !env.DB) {
      return new Response(JSON.stringify({ success: false, error: "未绑定变量名为 DB 的 D1 数据库" }), { status: 500, headers: corsHeaders });
    }
    try {
      const body = request.method === "POST" ? await request.json().catch(() => ({})) : {};
      const { action = "ping", username = "", password = "", newAccount = "", newPassword = "" } = body;
      if (action === "ping") {
        const admin = await env.DB.prepare(\`SELECT account FROM auth_credentials LIMIT 1\`).first();
        return new Response(JSON.stringify({ success: true, message: "D1 数据库 (xs) 连通正常", account: admin?.account || '已识别' }), { headers: corsHeaders });
      }
      if (action === "login") {
        const userMatch = await env.DB.prepare(\`SELECT account FROM auth_credentials WHERE account = ? AND password = ?\`).bind(username, password).first();
        if (userMatch) return new Response(JSON.stringify({ success: true, message: "验证通过", account: userMatch.account }), { headers: corsHeaders });
        return new Response(JSON.stringify({ success: false, error: "账号或密码错误" }), { status: 401, headers: corsHeaders });
      }
      if (action === "change" || action === "update") {
        const acc = newAccount || username;
        const pass = newPassword || password;
        await env.DB.prepare(\`UPDATE auth_credentials SET account = ?, password = ? WHERE id = 1\`).bind(acc, pass).run();
        return new Response(JSON.stringify({ success: true, message: "D1 数据库更新成功", account: acc }), { headers: corsHeaders });
      }
      return new Response(JSON.stringify({ success: false, error: "未知操作" }), { status: 400, headers: corsHeaders });
    } catch (e) {
      return new Response(JSON.stringify({ success: false, error: e.message }), { status: 500, headers: corsHeaders });
    }
  }
};`;
                            navigator.clipboard.writeText(code);
                            setCopiedWorkerCode(true);
                            setTimeout(() => setCopiedWorkerCode(false), 2000);
                          }}
                          className="text-purple-700 hover:text-purple-900 bg-purple-100 hover:bg-purple-200 px-2 py-0.5 rounded font-bold flex items-center gap-1 transition cursor-pointer"
                        >
                          {copiedWorkerCode ? <Check size={12} /> : <Copy size={12} />}
                          <span>{copiedWorkerCode ? '已复制源码' : '复制 Worker 代码'}</span>
                        </button>
                      </div>
                      <p className="text-[10px] text-neutral-500">源码已保存至根目录 <code className="font-mono bg-white border border-neutral-200 px-1 rounded">worker.js</code>。</p>
                    </div>
                  </div>
                )}
              </div>
            </form>
          ) : (
            /* Change Credentials Form */
            <form onSubmit={handleChangeCredentials} className="p-8 space-y-3.5">
              {changePassError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-semibold flex items-center gap-2">
                  <AlertCircle size={16} className="shrink-0 text-rose-500" />
                  <span>{changePassError}</span>
                </div>
              )}

              {changePassSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-xs font-semibold flex items-center gap-2">
                  <CheckCircle size={16} className="shrink-0 text-emerald-500" />
                  <span>{changePassSuccess}</span>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-neutral-600 uppercase tracking-wider block">
                  原密码验证 (Current Password)
                </label>
                <input
                  type="password"
                  required
                  className="w-full px-3.5 py-2 bg-neutral-50/50 border border-neutral-200 hover:border-neutral-300 focus:border-neutral-900 focus:bg-white rounded-xl outline-none text-sm transition font-medium"
                  placeholder="请输入当前 D1 数据库中的原密码"
                  value={oldPasswordInput}
                  onChange={(e) => {
                    setOldPasswordInput(e.target.value);
                    setChangePassError('');
                  }}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-neutral-600 uppercase tracking-wider block">
                  新账号 (New Account)
                </label>
                <input
                  type="text"
                  required
                  className="w-full px-3.5 py-2 bg-neutral-50/50 border border-neutral-200 hover:border-neutral-300 focus:border-neutral-900 focus:bg-white rounded-xl outline-none text-sm transition font-medium"
                  placeholder="请输入新的账号"
                  value={newUsernameInput}
                  onChange={(e) => {
                    setNewUsernameInput(e.target.value);
                    setChangePassError('');
                  }}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-neutral-600 uppercase tracking-wider block">
                  新密码 (New Password)
                </label>
                <input
                  type="password"
                  className="w-full px-3.5 py-2 bg-neutral-50/50 border border-neutral-200 hover:border-neutral-300 focus:border-neutral-900 focus:bg-white rounded-xl outline-none text-sm transition font-medium"
                  placeholder="留空则保持原密码"
                  value={newPasswordInput}
                  onChange={(e) => {
                    setNewPasswordInput(e.target.value);
                    setChangePassError('');
                  }}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-neutral-600 uppercase tracking-wider block">
                  确认新密码 (Confirm New Password)
                </label>
                <input
                  type="password"
                  className="w-full px-3.5 py-2 bg-neutral-50/50 border border-neutral-200 hover:border-neutral-300 focus:border-neutral-900 focus:bg-white rounded-xl outline-none text-sm transition font-medium"
                  placeholder="请再次输入新的密码"
                  value={confirmPasswordInput}
                  onChange={(e) => {
                    setConfirmPasswordInput(e.target.value);
                    setChangePassError('');
                  }}
                />
              </div>

              <div className="pt-2 space-y-2">
                <button
                  type="submit"
                  disabled={isCfAuthenticating}
                  className="w-full py-3 px-6 bg-purple-600 hover:bg-purple-700 active:bg-purple-800 disabled:bg-neutral-300 text-white font-bold text-sm rounded-xl transition duration-150 shadow-md shadow-purple-200 flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isCfAuthenticating ? <RefreshCw size={17} className="animate-spin" /> : <Cloud size={17} />}
                  <span>{isCfAuthenticating ? '正在提交到 D1 数据库...' : '同步更新到 D1 数据库'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setIsChangingPassword(false);
                    setChangePassError('');
                    setChangePassSuccess('');
                  }}
                  className="w-full py-2.5 px-6 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 font-semibold text-xs rounded-xl transition cursor-pointer"
                >
                  返回登录
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fafafb] flex font-sans text-neutral-800 antialiased">
      {/* Left Sidebar - Navigation */}
      <aside className="w-80 bg-white border-r border-neutral-200/80 flex flex-col justify-between shrink-0">
        <div className="p-6">
          <div className="flex items-center gap-3 px-2 mb-8">
            <div className="w-10 h-10 rounded-xl bg-purple-600 flex items-center justify-center text-white shadow-lg shadow-purple-100">
              <Cpu size={22} className="animate-pulse" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-neutral-900">模型平台</h1>
              <p className="text-xs text-neutral-400 font-medium">Model Testing Portal</p>
            </div>
          </div>

          <h2 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider px-3 mb-3">AI 提供商</h2>
          <nav className="space-y-1.5">
            {MODELS.map(model => {
              const MIcon = model.icon;
              const isActive = selectedModel.id === model.id;
              return (
                <button
                  key={model.id}
                  onClick={() => {
                    setSelectedModel(model);
                    setSearchQuery('');
                  }}
                  className={`w-full flex items-center gap-4 p-3.5 rounded-xl text-left border transition-all duration-200 cursor-pointer ${
                    isActive 
                      ? model.activeColorClass 
                      : 'border-transparent text-neutral-600 ' + model.hoverColorClass
                  }`}
                >
                  <div className={`p-2 rounded-lg transition-colors duration-200 ${
                    isActive ? 'bg-white/20 text-white' : 'bg-neutral-50 border border-neutral-100 text-neutral-500'
                  }`}>
                    <MIcon size={18} />
                  </div>
                  <div>
                    <div className="font-semibold text-sm leading-tight">{model.name}</div>
                    <div className="text-[11px] opacity-75 mt-0.5 font-normal truncate max-w-[170px]">{model.description}</div>
                  </div>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-6 border-t border-neutral-100 bg-neutral-50/50 space-y-3">
          <div className="flex items-center justify-between px-3.5 py-2.5 bg-white rounded-xl border border-neutral-200/80 text-xs">
            <div className="flex items-center gap-2 font-semibold text-neutral-700 min-w-0">
              <Cloud size={15} className="text-purple-600 shrink-0" />
              <div className="truncate text-[11px] font-mono">
                {localStorage.getItem('cf_authenticated_user') || 'D1 管理员'}
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="text-neutral-400 hover:text-rose-600 font-medium transition text-[11px] shrink-0 cursor-pointer ml-1"
            >
              退出登录
            </button>
          </div>
          {cfWorkerUrl && (
            <div className="px-2 py-1.5 bg-purple-50/80 border border-purple-100 rounded-lg text-[10px] text-purple-700 font-mono truncate flex items-center gap-1.5">
              <Globe size={12} className="shrink-0 text-purple-500" />
              <span className="truncate">{cfWorkerUrl}</span>
            </div>
          )}
          <div className="flex items-center gap-2 text-xs text-neutral-500 font-medium px-1">
            <HelpCircle size={14} className="text-neutral-400 shrink-0" />
            <span>基于 Cloudflare D1 数据库实时鉴权</span>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 max-w-5xl mx-auto p-10 space-y-8 overflow-y-auto">
        <header className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${selectedModel.colorClass}`}>
                <IconComponent size={12} />
                <span>{selectedModel.name}</span>
              </span>
            </div>
            <h2 className="text-3xl font-bold tracking-tight text-neutral-900 mt-2.5">
              配置 &amp; 检索您的专属模型
            </h2>
            <p className="text-sm text-neutral-500 mt-1.5 max-w-2xl leading-relaxed">
              在这里可以随时输入您的密钥、自定义代理接口并一键刷新该账号在对应的提供商中开通的所有模型，最后进行极速的接口可用性测试。
            </p>
          </div>
        </header>

        {/* 1. API Key Input Section */}
        <section className="bg-white p-7 rounded-2xl border border-neutral-200/80 shadow-sm space-y-4 transition-all duration-300">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="w-6 h-6 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center text-xs font-bold font-mono">1</span>
              <h3 className="text-base font-bold text-neutral-900">手动填写 {selectedModel.name} API密钥(API KEY)</h3>
            </div>
            
            {/* Status Indicator Badge */}
            {isKeySaved ? (
              <span className="inline-flex items-center gap-1 px-3 py-1 bg-emerald-50 border border-emerald-100 text-emerald-600 text-xs font-semibold rounded-full">
                <CheckCircle2 size={13} />
                <span>已保存 API Key</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-3 py-1 bg-neutral-100 border border-neutral-200 text-neutral-500 text-xs font-semibold rounded-full">
                <XCircle size={13} />
                <span>未保存 API Key</span>
              </span>
            )}
          </div>

          <div className="flex flex-col gap-3">
            <div className="relative flex items-center">
              <input
                type={showKey ? "text" : "password"}
                className="w-full pl-4 pr-12 py-3 bg-neutral-50/50 border border-neutral-200 hover:border-neutral-300 focus:border-neutral-900 focus:bg-white rounded-xl outline-none text-sm transition font-mono tracking-wide"
                placeholder={selectedModel.keyPlaceholder}
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
              />
              <button 
                onClick={() => setShowKey(!showKey)} 
                type="button" 
                className="absolute right-4 text-neutral-400 hover:text-neutral-600 transition"
              >
                {showKey ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            
            <div className="flex items-center justify-between text-xs text-neutral-400 leading-relaxed pl-1">
              <span>提示：需手动点击『保存 Key』后才会生效保存至浏览器本地。</span>
              {apiKeyInput !== activeConfig.apiKey && apiKeyInput.trim().length > 0 && (
                <span className="text-amber-600 font-medium">⚠️ 密钥有变动，请点击下方『保存 Key』</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2.5 pt-1.5">
            <button 
              onClick={handleSaveKey} 
              disabled={!apiKeyInput.trim()}
              className="flex items-center justify-center gap-2 px-5 py-2.5 bg-neutral-900 hover:bg-neutral-800 disabled:bg-neutral-100 disabled:text-neutral-400 text-white text-sm font-semibold rounded-xl transition duration-150 shadow-sm"
            >
              {keySaveNotice ? <CheckCircle2 size={15} className="text-emerald-400" /> : <Save size={15} />} 
              <span>{keySaveNotice ? "保存成功！" : "保存 Key"}</span>
            </button>
            <button 
              onClick={handleClearKey} 
              className="flex items-center justify-center gap-2 px-5 py-2.5 bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 text-neutral-600 hover:text-neutral-900 text-sm font-semibold rounded-xl transition duration-150"
            >
              <Trash2 size={15} /> 
              <span>清除 Key</span>
            </button>
          </div>
        </section>

        {/* 3. Custom Model Endpoint Section */}
        <section className="bg-white p-7 rounded-2xl border border-neutral-200/80 shadow-sm space-y-5">
          <div className="flex items-center gap-2.5">
            <span className="w-6 h-6 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center text-xs font-bold font-mono">3</span>
            <div>
              <h3 className="text-base font-bold text-neutral-900">自定义模型配置</h3>
              <p className="text-xs text-neutral-400 mt-0.5">若使用非官方 API 代理，请在此配置自定义的 API URL</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider block pl-1">模型列表 API URL:</label>
              <input
                type="text"
                className="w-full px-4 py-3 bg-neutral-50/50 border border-neutral-200 hover:border-neutral-300 focus:border-neutral-900 focus:bg-white rounded-xl outline-none text-sm transition"
                placeholder={selectedModel.modelsUrlPlaceholder}
                value={activeConfig.modelsListUrl}
                onChange={(e) => updateConfig({ modelsListUrl: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider block pl-1">模型基础 API URL:</label>
              <input
                type="text"
                className="w-full px-4 py-3 bg-neutral-50/50 border border-neutral-200 hover:border-neutral-300 focus:border-neutral-900 focus:bg-white rounded-xl outline-none text-sm transition"
                placeholder={selectedModel.baseUrlPlaceholder}
                value={activeConfig.baseUrl}
                onChange={(e) => updateConfig({ baseUrl: e.target.value })}
              />
            </div>
          </div>

          {selectedModel.id !== 'gemini' && (
            <div className="pt-2 border-t border-neutral-100">
              <label className="flex items-start gap-3 cursor-pointer group">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 rounded border-neutral-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  checked={activeConfig.autocompleteUrl}
                  onChange={(e) => updateConfig({ autocompleteUrl: e.target.checked })}
                />
                <div>
                  <span className="text-sm font-semibold text-neutral-700 group-hover:text-neutral-900 transition">
                    自动补全 /chat/completions (OpenAI 协议标准)
                  </span>
                  <div className="text-xs text-neutral-400 space-y-1.5 mt-2 bg-neutral-50 p-3.5 rounded-xl border border-neutral-100 max-w-2xl leading-relaxed">
                    <div className="flex items-center gap-1.5 font-medium text-neutral-500">
                      <HelpCircle size={13} />
                      <span>说明：</span>
                    </div>
                    <ul className="list-disc pl-4 space-y-1">
                      <li><strong className="text-neutral-600 font-semibold">勾选 (推荐)：</strong>输入 Base URL (如 https://api.openai.com/v1) 时，系统会自动在末尾补充 /chat/completions 路径；</li>
                      <li><strong className="text-neutral-600 font-semibold">不勾选：</strong>系统不会添加 /chat/completions，将直接向您填写的原始完整 URL 发送请求 (适用于自定义非标接口或已包含完整 Endpoint 的 URL)。</li>
                    </ul>
                  </div>
                </div>
              </label>
            </div>
          )}
        </section>

        {/* 2. Model Selection & Live Listing Area */}
        <section className="bg-white p-7 rounded-2xl border border-neutral-200/80 shadow-sm space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-neutral-100">
            <div className="space-y-1">
              <div className="flex items-center gap-2.5">
                <span className="w-6 h-6 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center text-xs font-bold font-mono">2</span>
                <h3 className="text-base font-bold text-neutral-900">
                  账号对应的所有模型列表 
                  <span className="ml-2 font-mono text-xs px-2 py-0.5 bg-neutral-100 border border-neutral-200 text-neutral-600 rounded-md">
                    {activeModelList.length}
                  </span>
                </h3>
              </div>
              <p className="text-xs text-neutral-400">可推出所有 {selectedModel.name} 语言和分析模型的 API 密钥支持</p>
            </div>

            <button 
              onClick={fetchModels} 
              disabled={loading || !activeConfig.apiKey}
              className="flex items-center justify-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-50 disabled:text-indigo-300 text-white text-sm font-semibold rounded-xl transition duration-150 shadow-sm shadow-indigo-100"
            >
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
              <span>{loading ? "正在加载模型..." : "刷新/获取所有模型"}</span>
            </button>
          </div>

          {/* Render Visual Grid of available models */}
          <div className="space-y-4">
            {/* Show inline error card if fetch models failed */}
            {fetchError && (
              <div className="p-4 bg-rose-50 border border-rose-100 rounded-xl text-rose-700 text-xs flex flex-col gap-1.5 shadow-sm animate-fadeIn">
                <div className="flex items-center gap-2 font-bold text-rose-800">
                  <XCircle size={15} />
                  <span>获取专属模型列表失败</span>
                </div>
                <p className="font-mono leading-relaxed bg-white/60 p-2 rounded border border-rose-100/50">{fetchError}</p>
                <p className="text-[11px] text-rose-600 leading-relaxed font-medium">
                  提示：未成功获取专属模型。请检查 API Key 格式或代理接口配置。
                </p>
              </div>
            )}

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-neutral-500">
                  ✨ 账号下可用的专属模型列表：
                </span>
              </div>

              {/* Search Bar inside Models list */}
              <div className="relative flex items-center max-w-sm">
                <Search size={14} className="absolute left-3.5 text-neutral-400" />
                <input
                  type="text"
                  className="w-full pl-9 pr-4 py-1.5 bg-neutral-50/50 border border-neutral-200/80 hover:border-neutral-300 focus:border-neutral-900 focus:bg-white rounded-lg outline-none text-xs transition"
                  placeholder="在列表中检索特定模型..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-72 overflow-y-auto p-1 border border-neutral-100 rounded-xl bg-neutral-50/20">
                {filteredModels.length > 0 ? (
                  filteredModels.map(mName => {
                    const isSelected = currentSelectedModelId === mName;
                    return (
                      <button
                        key={mName}
                        onClick={() => updateConfig({ selectedModelId: mName })}
                        className={`flex items-center justify-between p-3 rounded-lg text-left text-xs font-medium border transition-all duration-150 ${
                          isSelected 
                            ? 'bg-neutral-900 text-white border-neutral-900 shadow-sm' 
                            : 'bg-white text-neutral-700 hover:text-neutral-900 border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50'
                        }`}
                      >
                        <span className="truncate pr-2 font-mono">{mName}</span>
                        {isSelected && <Check size={12} className="shrink-0 text-white" />}
                      </button>
                    );
                  })
                ) : (
                  <div className="col-span-full py-8 text-center text-xs text-neutral-400">
                    没有找到匹配 "{searchQuery}" 的模型
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Test and Execute Area */}
          <div className="pt-6 border-t border-neutral-100 space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider block pl-1">
                测试提示词:
              </label>
              <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center">
                <input
                  type="text"
                  className="flex-1 px-4 py-3 bg-neutral-50/50 border border-neutral-200 hover:border-neutral-300 focus:border-neutral-900 focus:bg-white rounded-xl outline-none text-sm transition"
                  placeholder="你好！请回复确认当前模型可用。"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                />
                
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 shrink-0">
                  <button
                    onClick={handleSubmit}
                    disabled={testing || batchTesting || !activeConfig.apiKey || !prompt || !currentSelectedModelId}
                    className="flex items-center justify-center gap-2 px-5 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-neutral-100 disabled:text-neutral-400 text-white text-sm font-semibold rounded-xl transition duration-150 shadow-sm"
                  >
                    <MessageSquare size={16} />
                    <span>{testing ? "测试中..." : "测试当前所选模型"}</span>
                  </button>

                  {!batchTesting ? (
                    <button
                      onClick={handleBatchTest}
                      disabled={testing || !activeConfig.apiKey || !prompt || activeModelList.length === 0}
                      className="flex items-center justify-center gap-2 px-5 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-neutral-100 disabled:text-neutral-400 text-white text-sm font-semibold rounded-xl transition duration-150 shadow-sm"
                    >
                      <Layers size={16} />
                      <span>一键测试所有模型 ({activeModelList.length})</span>
                    </button>
                  ) : (
                    <button
                      onClick={stopBatchTest}
                      className="flex items-center justify-center gap-2 px-5 py-3 bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold rounded-xl transition duration-150 shadow-sm animate-pulse"
                    >
                      <Square size={15} />
                      <span>停止批量测试</span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Test View Switcher (if results exist for both) */}
            {(response || batchArray.length > 0) && (
              <div className="flex items-center gap-2 border-b border-neutral-200/80 pb-3 pt-2">
                {response && (
                  <button
                    onClick={() => setTestViewMode('single')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
                      testViewMode === 'single'
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                    }`}
                  >
                    <MessageSquare size={14} />
                    <span>单模型测试结果 ({currentSelectedModelId})</span>
                  </button>
                )}

                {batchArray.length > 0 && (
                  <button
                    onClick={() => setTestViewMode('batch')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
                      testViewMode === 'batch'
                        ? 'bg-purple-600 text-white shadow-sm'
                        : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                    }`}
                  >
                    <Layers size={14} />
                    <span>全模型批量测试看板 ({batchStats.completed}/{batchStats.total})</span>
                  </button>
                )}
              </div>
            )}

            {/* Single Model Response Output Card */}
            {testViewMode === 'single' && (testing || response) && (
              <div className="mt-2 border border-neutral-200/80 rounded-2xl bg-neutral-50/30 overflow-hidden shadow-sm">
                <div className="flex items-center justify-between px-5 py-3.5 bg-neutral-50 border-b border-neutral-200/80">
                  <div className="flex items-center gap-2.5">
                    <div className="w-2 h-2 rounded-full bg-indigo-500 animate-ping" />
                    <span className="text-xs font-bold text-neutral-700">单模型测试结果</span>
                    {currentSelectedModelId && (
                      <span className="text-[10px] bg-neutral-200 px-2 py-0.5 rounded text-neutral-700 font-mono font-medium">
                        {currentSelectedModelId}
                      </span>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-3">
                    {testTime !== null && (
                      <div className="flex items-center gap-1 text-[11px] text-neutral-500 font-medium">
                        <Clock size={12} />
                        <span>耗时: {testTime.toFixed(2)}s</span>
                      </div>
                    )}
                    
                    {response && (
                      <button 
                        onClick={copyToClipboard}
                        className="flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-neutral-100 border border-neutral-200 rounded-lg text-xs text-neutral-600 hover:text-neutral-900 font-medium transition"
                      >
                        {copied ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                        <span>{copied ? "已复制" : "复制"}</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="p-5">
                  {testing ? (
                    <div className="space-y-2.5 py-2">
                      <div className="h-3 bg-neutral-200/80 rounded animate-pulse w-3/4" />
                      <div className="h-3 bg-neutral-200/80 rounded animate-pulse w-5/6" />
                      <div className="h-3 bg-neutral-200/80 rounded animate-pulse w-1/2" />
                    </div>
                  ) : (
                    <div className="text-sm text-neutral-700 leading-relaxed font-mono whitespace-pre-wrap bg-white p-4 rounded-xl border border-neutral-200/60 shadow-inner max-h-96 overflow-y-auto">
                      {response}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Batch Test Results Dashboard */}
            {testViewMode === 'batch' && batchArray.length > 0 && (
              <div className="mt-2 border border-neutral-200/80 rounded-2xl bg-neutral-50/20 overflow-hidden space-y-4 p-5 shadow-sm">
                {/* Progress bar & Stat Counters */}
                <div className="space-y-3 bg-white p-4 rounded-xl border border-neutral-200/80">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Layers size={16} className="text-purple-600" />
                      <span className="text-sm font-bold text-neutral-800">全模型批量测试进度</span>
                      {batchTesting && (
                        <span className="text-[11px] text-purple-600 font-semibold animate-pulse flex items-center gap-1">
                          <RefreshCw size={12} className="animate-spin" /> 测试进行中...
                        </span>
                      )}
                    </div>
                    <div className="text-xs font-mono font-semibold text-neutral-500">
                      {batchStats.completed} / {batchStats.total} ({batchStats.total > 0 ? Math.round((batchStats.completed / batchStats.total) * 100) : 0}%)
                    </div>
                  </div>

                  {/* Progress Line */}
                  <div className="w-full h-2.5 bg-neutral-100 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-purple-600 transition-all duration-300 rounded-full"
                      style={{ width: `${batchStats.total > 0 ? (batchStats.completed / batchStats.total) * 100 : 0}%` }}
                    />
                  </div>

                  {/* Stat Badges */}
                  <div className="flex flex-wrap items-center gap-2 pt-1 text-xs font-medium">
                    <span className="px-2.5 py-1 bg-neutral-100 text-neutral-600 rounded-lg border border-neutral-200/60 font-mono">
                      总数: {batchStats.total}
                    </span>
                    <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-lg border border-emerald-200/60 font-mono font-bold flex items-center gap-1">
                      <CheckCircle size={12} /> 成功: {batchStats.success}
                    </span>
                    <span className="px-2.5 py-1 bg-rose-50 text-rose-700 rounded-lg border border-rose-200/60 font-mono font-bold flex items-center gap-1">
                      <XCircle size={12} /> 失败: {batchStats.error}
                    </span>
                    {batchStats.testingCount > 0 && (
                      <span className="px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-lg border border-indigo-200/60 font-mono font-bold flex items-center gap-1">
                        <RefreshCw size={12} className="animate-spin" /> 测试中: {batchStats.testingCount}
                      </span>
                    )}
                    {batchStats.pending > 0 && (
                      <span className="px-2.5 py-1 bg-neutral-50 text-neutral-400 rounded-lg border border-neutral-200/50 font-mono">
                        待测试: {batchStats.pending}
                      </span>
                    )}
                  </div>
                </div>

                {/* Filter and Search inside Batch Results */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-1.5 bg-white p-1 rounded-xl border border-neutral-200/80 self-start">
                    <button
                      onClick={() => setBatchFilter('all')}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                        batchFilter === 'all' ? 'bg-neutral-900 text-white shadow-sm' : 'text-neutral-600 hover:text-neutral-900'
                      }`}
                    >
                      全部 ({batchStats.total})
                    </button>
                    <button
                      onClick={() => setBatchFilter('success')}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                        batchFilter === 'success' ? 'bg-emerald-600 text-white shadow-sm' : 'text-emerald-600 hover:bg-emerald-50'
                      }`}
                    >
                      成功 ({batchStats.success})
                    </button>
                    <button
                      onClick={() => setBatchFilter('error')}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                        batchFilter === 'error' ? 'bg-rose-600 text-white shadow-sm' : 'text-rose-600 hover:bg-rose-50'
                      }`}
                    >
                      失败 ({batchStats.error})
                    </button>
                  </div>

                  <div className="relative flex items-center max-w-xs">
                    <Search size={14} className="absolute left-3 text-neutral-400" />
                    <input
                      type="text"
                      className="w-full pl-8 pr-3 py-1.5 bg-white border border-neutral-200 hover:border-neutral-300 focus:border-neutral-900 rounded-lg outline-none text-xs transition"
                      placeholder="筛选模型结果..."
                      value={batchSearch}
                      onChange={(e) => setBatchSearch(e.target.value)}
                    />
                  </div>
                </div>

                {/* Batch Models Table List */}
                <div className="border border-neutral-200/80 rounded-xl overflow-hidden bg-white max-h-[420px] overflow-y-auto divide-y divide-neutral-100">
                  {filteredBatchResults.length > 0 ? (
                    filteredBatchResults.map((item) => {
                      const isSucc = item.status === 'success';
                      const isErr = item.status === 'error';
                      const isRun = item.status === 'testing';

                      return (
                        <div key={item.model} className="p-3.5 hover:bg-neutral-50/80 transition flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
                          <div className="space-y-1 min-w-[200px]">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-neutral-800">{item.model}</span>
                              {item.time !== undefined && (
                                <span className="text-[10px] text-neutral-400 font-mono">
                                  ({item.time.toFixed(2)}s)
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-neutral-500 truncate max-w-lg font-mono">
                              {isSucc && item.response ? item.response.substring(0, 90) + (item.response.length > 90 ? '...' : '') : ''}
                              {isErr && item.error ? item.error : ''}
                              {isRun && <span className="text-indigo-600 italic">正在调用测试接口...</span>}
                              {item.status === 'pending' && <span className="text-neutral-400 italic">等待队列调度...</span>}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                            {/* Status badge */}
                            {isSucc && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200/60 font-semibold rounded-lg text-[11px]">
                                <CheckCircle size={12} /> 可用
                              </span>
                            )}
                            {isErr && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-rose-50 text-rose-700 border border-rose-200/60 font-semibold rounded-lg text-[11px]">
                                <XCircle size={12} /> 异常
                              </span>
                            )}
                            {isRun && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-50 text-indigo-700 border border-indigo-200/60 font-semibold rounded-lg text-[11px]">
                                <RefreshCw size={12} className="animate-spin" /> 测试中
                              </span>
                            )}
                            {item.status === 'pending' && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-neutral-100 text-neutral-500 border border-neutral-200/60 font-medium rounded-lg text-[11px]">
                                待测试
                              </span>
                            )}

                            {/* View Detail button */}
                            {(item.response || item.error) && (
                              <button
                                onClick={() => setSelectedModalResult(item)}
                                className="px-2.5 py-1 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-lg font-medium transition"
                              >
                                查看详情
                              </button>
                            )}

                            {/* Single Retest button */}
                            <button
                              disabled={isRun}
                              onClick={() => handleTestSingleInBatch(item.model)}
                              className="px-2 py-1 bg-white hover:bg-neutral-100 border border-neutral-200 text-neutral-600 rounded-lg font-medium transition disabled:opacity-50"
                              title="对该单个模型重新测试"
                            >
                              <RefreshCw size={12} className={isRun ? 'animate-spin' : ''} />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="p-8 text-center text-xs text-neutral-400">
                      没有符合条件的测试结果
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Modal Dialog for Batch Model Result Detail */}
        {selectedModalResult && (
          <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-fadeIn">
            <div className="bg-white rounded-2xl border border-neutral-200 shadow-xl max-w-2xl w-full overflow-hidden flex flex-col max-h-[85vh]">
              <div className="flex items-center justify-between p-4 px-6 border-b border-neutral-100 bg-neutral-50">
                <div className="flex items-center gap-2">
                  <FileText size={16} className="text-indigo-600" />
                  <h3 className="font-bold text-sm font-mono text-neutral-900">{selectedModalResult.model} 详细返回结果</h3>
                </div>
                <button 
                  onClick={() => setSelectedModalResult(null)}
                  className="p-1 text-neutral-400 hover:text-neutral-700 rounded-lg transition"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="p-6 overflow-y-auto space-y-4">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-neutral-500 font-semibold">状态:</span>
                    {selectedModalResult.status === 'success' ? (
                      <span className="text-emerald-600 font-bold flex items-center gap-1">
                        <CheckCircle size={13} /> 调用成功 (接口可用)
                      </span>
                    ) : (
                      <span className="text-rose-600 font-bold flex items-center gap-1">
                        <XCircle size={13} /> 调用失败
                      </span>
                    )}
                  </div>

                  {selectedModalResult.time !== undefined && (
                    <span className="text-neutral-400 font-mono">
                      响应耗时: {selectedModalResult.time.toFixed(2)}s
                    </span>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-neutral-500 uppercase tracking-wider block">接口响应正文 / 错误日志:</label>
                  <div className="p-4 bg-neutral-900 text-neutral-100 rounded-xl font-mono text-xs leading-relaxed whitespace-pre-wrap break-all max-h-80 overflow-y-auto border border-neutral-800 shadow-inner">
                    {selectedModalResult.response || selectedModalResult.error || "（无响应文本）"}
                  </div>
                </div>
              </div>

              <div className="p-4 px-6 border-t border-neutral-100 bg-neutral-50 flex items-center justify-between">
                <button
                  onClick={() => {
                    const text = selectedModalResult.response || selectedModalResult.error || "";
                    navigator.clipboard.writeText(text);
                  }}
                  className="flex items-center gap-1.5 px-4 py-2 bg-white border border-neutral-200 hover:bg-neutral-100 rounded-xl text-xs font-semibold text-neutral-700 transition"
                >
                  <Copy size={13} /> 复制返回内容
                </button>

                <button
                  onClick={() => setSelectedModalResult(null)}
                  className="px-5 py-2 bg-neutral-900 hover:bg-neutral-800 text-white rounded-xl text-xs font-semibold transition"
                >
                  关闭
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 4. API Proxy Gateway (OpenAI-compatible) */}
        <section className="bg-white p-7 rounded-2xl border border-neutral-200/80 shadow-sm space-y-6">
          <div className="flex items-center gap-2.5 pb-4 border-b border-neutral-100">
            <span className="w-6 h-6 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center text-xs font-bold font-mono">4</span>
            <div>
              <h3 className="text-base font-bold text-neutral-900">API 中转代理服务 (支持外部客户端调用)</h3>
              <p className="text-xs text-neutral-400 mt-0.5">您可将本程序作为一个通用的 API 中继网关，配合如 Chatbox, LobeChat, NextChat, Dify 等客户端直接使用</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="bg-neutral-50/50 p-4.5 rounded-xl border border-neutral-200/60 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">接口代理 Base URL (OpenAI 协议):</span>
                  <button 
                    onClick={copyBaseUrl}
                    className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 font-semibold"
                  >
                    {copiedBaseUrl ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                    <span>{copiedBaseUrl ? "已复制" : "复制"}</span>
                  </button>
                </div>
                <div className="p-3 bg-white border border-neutral-200/80 rounded-lg text-sm font-mono text-neutral-800 break-all select-all">
                  {window.location.origin}/v1
                </div>
                <p className="text-[11px] text-neutral-400">
                  支持的接口：<code className="bg-neutral-100 px-1 rounded text-[10px]">/v1/chat/completions</code> & <code className="bg-neutral-100 px-1 rounded text-[10px]">/v1/models</code> (可完美支持流式 SSE 响应)
                </p>
              </div>

              <div className="bg-neutral-50/50 p-4.5 rounded-xl border border-neutral-200/60 space-y-2">
                <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider block">API 密钥 (Authorization Bearer Key):</span>
                <div className="p-3 bg-white border border-neutral-200/80 rounded-lg text-sm font-mono text-neutral-700">
                  {isKeySaved ? "使用您配置的 API Key 即可 (Bearer 格式认证)" : "请在上方第1步中填写 API Key 后再使用"}
                </div>
                <p className="text-[11px] text-neutral-400">
                  在您配置的外部客户端中，直接填入您本账户所持有的真实 API Key 作为认证令牌。
                </p>
              </div>
            </div>

            <div className="bg-neutral-50/30 p-5 rounded-xl border border-neutral-200/60 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-neutral-500 uppercase tracking-wider">
                  <Cpu size={13} />
                  <span>多渠道智能路由规则 & 推荐模型：</span>
                </div>
              </div>
              <p className="text-xs text-neutral-600 leading-relaxed">
                中转代理包含<strong>智能自动路由模式</strong>，会自动读取您请求中的 model 名称转发至最合适的供应商接口：
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div className="p-3 bg-white border border-neutral-200/50 rounded-lg">
                  <div className="font-semibold text-indigo-600 mb-1">Google Gemini</div>
                  <div className="text-neutral-400 text-[10px]">模型匹配: <code className="bg-neutral-100 p-0.5 rounded">gemini-*</code> / <code className="bg-neutral-100 p-0.5 rounded">gemma-*</code></div>
                  <div className="text-[10px] text-neutral-500 mt-1">中转地址: <code className="bg-neutral-50 p-0.5 rounded">/v1/gemini</code></div>
                </div>
                <div className="p-3 bg-white border border-neutral-200/50 rounded-lg">
                  <div className="font-semibold text-emerald-600 mb-1">OpenAI GPT</div>
                  <div className="text-neutral-400 text-[10px]">模型匹配: <code className="bg-neutral-100 p-0.5 rounded">gpt-*</code> / <code className="bg-neutral-100 p-0.5 rounded">o1-*</code></div>
                  <div className="text-[10px] text-neutral-500 mt-1">中转地址: <code className="bg-neutral-50 p-0.5 rounded">/v1/openai</code></div>
                </div>
                <div className="p-3 bg-white border border-neutral-200/50 rounded-lg">
                  <div className="font-semibold text-amber-600 mb-1">Anthropic Claude</div>
                  <div className="text-neutral-400 text-[10px]">模型匹配: <code className="bg-neutral-100 p-0.5 rounded">claude-*</code></div>
                  <div className="text-[10px] text-neutral-500 mt-1">中转地址: <code className="bg-neutral-50 p-0.5 rounded">/v1/claude</code></div>
                </div>
                <div className="p-3 bg-white border border-neutral-200/50 rounded-lg">
                  <div className="font-semibold text-orange-600 mb-1">Groq Speed</div>
                  <div className="text-neutral-400 text-[10px]">模型匹配: <code className="bg-neutral-100 p-0.5 rounded">llama-*</code> / <code className="bg-neutral-100 p-0.5 rounded">mixtral-*</code></div>
                  <div className="text-[10px] text-neutral-500 mt-1">中转地址: <code className="bg-neutral-50 p-0.5 rounded">/v1/groq</code></div>
                </div>
              </div>
            </div>

            <div className="bg-neutral-900 text-neutral-100 p-5 rounded-xl border border-neutral-800 space-y-3 font-mono text-xs">
              <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
                <span className="text-neutral-400 font-bold">快速 cURL 连接测试命令</span>
                <button 
                  onClick={copyCurlCommand}
                  className="flex items-center gap-1.5 text-neutral-300 hover:text-white transition font-medium"
                >
                  {copiedCurlCommand ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                  <span>{copiedCurlCommand ? "已复制测试命令" : "复制代码"}</span>
                </button>
              </div>
              <pre className="overflow-x-auto whitespace-pre leading-relaxed py-1 text-neutral-300">
{`curl ${window.location.origin}/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${isKeySaved ? 'YOUR_API_KEY' : 'YOUR_API_KEY'}" \\
  -d '{
    "model": "${currentSelectedModelId || "gemini-2.5-flash"}",
    "messages": [{"role": "user", "content": "你好！"}]
  }'`}
              </pre>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
