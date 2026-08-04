/**
 * Cloudflare Worker - D1 数据库 (xs) 认证与密码同步后端
 * 
 * 注意：100% 纯依赖 Cloudflare D1 数据库中的 auth_credentials 数据表。
 * 部署步骤:
 * 1. 在 Cloudflare 控制台 Worker 在线编辑器中粘贴此代码并点击 "保存并部署"
 * 2. 在 Worker【设置】->【变量与绑定】中，绑定 D1 数据库 (变量名必须为大写: DB，绑定库为 xs)
 * 3. 复制 Worker 部署后生成的公共网址 (如 https://your-subdomain.workers.dev) 粘贴到本系统连接登录！
 */

export default {
  async fetch(request, env, ctx) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Content-Type": "application/json; charset=utf-8",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (!env || !env.DB) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Worker 未绑定 D1 数据库！请在 Cloudflare 设置 -> 变量与绑定中，添加变量名为 DB 的 D1 数据库绑定。",
        }),
        { status: 500, headers: corsHeaders }
      );
    }

    try {
      let body = {};
      if (request.method === "POST") {
        try {
          body = await request.json();
        } catch (e) {
          body = {};
        }
      }

      const action = body.action || "ping";
      const username = (body.username || body.account || "").trim();
      const password = (body.password || "").trim();

      // 1. 测试连通性 (ping)
      if (action === "ping") {
        const record = await env.DB.prepare(`SELECT account FROM auth_credentials LIMIT 1`).first();
        return new Response(
          JSON.stringify({
            success: true,
            message: "Cloudflare D1 数据库 (xs) 连通正常！",
            account: record ? record.account : "已绑定",
          }),
          { status: 200, headers: corsHeaders }
        );
      }

      // 2. 登录验证 (login)
      if (action === "login") {
        if (!username || !password) {
          return new Response(
            JSON.stringify({ success: false, error: "缺少账号或密码" }),
            { status: 400, headers: corsHeaders }
          );
        }

        // 唯一精确匹配 D1 数据库中的账号与密码
        const userMatch = await env.DB.prepare(
          `SELECT account FROM auth_credentials WHERE account = ? AND password = ?`
        ).bind(username, password).first();

        if (userMatch) {
          return new Response(
            JSON.stringify({
              success: true,
              message: "Cloudflare D1 数据库验证成功",
              account: userMatch.account,
            }),
            { status: 200, headers: corsHeaders }
          );
        }

        return new Response(
          JSON.stringify({
            success: false,
            error: "账号或密码错误 (D1 数据库校验未通过)",
          }),
          { status: 401, headers: corsHeaders }
        );
      }

      // 3. 更新账号与密码 (change / update)
      if (action === "change" || action === "update") {
        const newAccount = (body.newAccount || username).trim();
        const newPassword = (body.newPassword || password).trim();

        if (!newAccount || !newPassword) {
          return new Response(
            JSON.stringify({ success: false, error: "新账号和新密码不能为空" }),
            { status: 400, headers: corsHeaders }
          );
        }

        // 更新 D1 数据库中的凭证记录
        const updateResult = await env.DB.prepare(
          `UPDATE auth_credentials SET account = ?, password = ? WHERE id = 1`
        ).bind(newAccount, newPassword).run();

        if (!updateResult.success || updateResult.meta.changes === 0) {
          await env.DB.prepare(
            `UPDATE auth_credentials SET account = ?, password = ?`
          ).bind(newAccount, newPassword).run();
        }

        return new Response(
          JSON.stringify({
            success: true,
            message: "D1 数据库账号密码更新成功！",
            account: newAccount,
          }),
          { status: 200, headers: corsHeaders }
        );
      }

      return new Response(
        JSON.stringify({ success: false, error: `未知的指令: ${action}` }),
        { status: 400, headers: corsHeaders }
      );

    } catch (error) {
      return new Response(
        JSON.stringify({
          success: false,
          error: `D1 数据库操作异常: ${error.message}`,
        }),
        { status: 500, headers: corsHeaders }
      );
    }
  },
};
