const encoder = new TextEncoder();
const decoder = new TextDecoder();
const SESSION_SECONDS = 20 * 60;
const MAX_ATTEMPTS = 5;
const BLOCK_SECONDS = 15 * 60;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const apiPath = url.pathname.startsWith("/administracao/api/")
      ? url.pathname.replace("/administracao/api", "/api")
      : url.pathname;

    try {
      if ((url.pathname === "/administracao" || url.pathname === "/administracao/") && request.method === "POST") {
        return adminFormAction(request, env);
      }
      if ((url.pathname === "/administracao" || url.pathname === "/administracao/") && request.method === "GET") {
        return adminPage(request, env);
      }
      if ((url.pathname === "/administracao/simulador" || url.pathname === "/administracao/simulador/") && request.method === "GET") {
        if (!(await authorizedAdmin(request, env))) return new Response("Não autorizado.", { status: 401 });
        return protectedAsset(request, env, "/simulador-interno.html");
      }
      if ((url.pathname === "/administracao/comparativo" || url.pathname === "/administracao/comparativo/") && request.method === "GET") {
        if (!(await authorizedAdmin(request, env))) return new Response("Não autorizado.", { status: 401 });
        return protectedAsset(request, env, "/comparativo-contratos.html");
      }
      if (url.pathname.startsWith("/administracao/assets/") && request.method === "GET") {
        if (!(await authorizedAdmin(request, env))) return new Response("Não autorizado.", { status: 401 });
        return protectedAsset(request, env, url.pathname.replace("/administracao/assets", ""));
      }
      if (apiPath === "/api/config" && request.method === "GET") {
        return json({ turnstileSiteKey: env.TURNSTILE_SITE_KEY });
      }
      if ((apiPath === "/api/entrar" || apiPath === "/api/cliente/entrar") && request.method === "POST") {
        return loginCliente(request, env);
      }
      if ((apiPath === "/api/processo" || apiPath === "/api/cliente/processo") && request.method === "GET") {
        return processoCliente(request, env);
      }
      if ((apiPath === "/api/sair" || apiPath === "/api/cliente/sair") && request.method === "POST") {
        return json({ ok: true }, 200, { "Set-Cookie": clearCookie("premium_cliente_session") });
      }
      if (apiPath === "/api/parceiro/entrar" && request.method === "POST") {
        return loginParceiro(request, env);
      }
      if (apiPath === "/api/parceiro/processos" && request.method === "GET") {
        return processosParceiro(request, env);
      }
      if (apiPath === "/api/parceiro/sair" && request.method === "POST") {
        return json({ ok: true }, 200, { "Set-Cookie": clearCookie("premium_parceiro_session") });
      }
      if ((apiPath === "/api/admin/gerar-codigo" || apiPath === "/api/admin/cliente/gerar-codigo") && request.method === "POST") {
        return gerarCodigoCliente(request, env);
      }
      if (apiPath === "/api/admin/parceiro/gerar-codigo" && request.method === "POST") {
        return gerarCodigoParceiro(request, env);
      }
      if (apiPath === "/api/admin/cliente/bloquear" && request.method === "POST") {
        return bloquearCliente(request, env);
      }
      if (apiPath === "/api/admin/parceiro/bloquear" && request.method === "POST") {
        return bloquearParceiro(request, env);
      }
      if (apiPath.startsWith("/api/")) return json({ error: "Endereço não encontrado." }, 404);

      if (url.pathname === "/cliente" || url.pathname === "/cliente/") return asset(request, env, "/cliente.html");
      if (url.pathname === "/parceiro" || url.pathname === "/parceiro/") return asset(request, env, "/parceiro.html");
      if (url.pathname === "/parceiro/painel" || url.pathname === "/parceiro/painel/") return asset(request, env, "/parceiro-painel.html");
      return env.ASSETS.fetch(request);
    } catch (error) {
      console.error("portal_error", error instanceof Error ? error.message : "unknown");
      return json({ error: "Não foi possível concluir a solicitação agora." }, 500);
    }
  },
};

async function adminFormAction(request, env) {
  if (!(await authorizedAdmin(request, env))) return new Response("Não autorizado.", { status: 401 });
  if (!sameOriginSubmission(request)) return new Response("Solicitação não permitida.", { status: 403 });
  const form = await request.formData();
  const action = String(form.get("acao") || "");
  const state = {};

  try {
    if (action === "cliente-gerar") {
      const cpf = digits(form.get("cpf"));
      if (cpf.length !== 11) throw new Error("CPF inválido.");
      if (!(await airtableProcess(cpf, env))) throw new Error("CPF não localizado na tabela Andamento.");
      state.clientCode = await storeClientCode(cpf, env);
      state.clientMessage = "Novo código criado com sucesso.";
    } else if (action === "parceiro-gerar") {
      const email = normalizeEmail(form.get("email"));
      if (!validEmail(email)) throw new Error("E-mail inválido.");
      const partner = await airtablePartnerByEmail(email, env);
      if (!partner) throw new Error("Parceiro não encontrado ou sem acesso habilitado.");
      state.partnerCode = await storePartnerCode(partner.id, env);
      state.partnerMessage = `Novo código criado para ${partner.fields?.Nome || "o parceiro"}.`;
    } else if (action === "cliente-bloquear") {
      const cpf = digits(form.get("cpf"));
      if (cpf.length !== 11) throw new Error("CPF inválido.");
      const key = `code:${await hmacHex(cpf, env.CODE_PEPPER)}`;
      await env.PORTAL_KV.put(key, JSON.stringify({ active: false, blockedAt: new Date().toISOString() }));
      state.clientMessage = "Acesso bloqueado com sucesso.";
    } else if (action === "parceiro-bloquear") {
      const email = normalizeEmail(form.get("email"));
      if (!validEmail(email)) throw new Error("E-mail inválido.");
      const partner = await airtablePartnerByEmail(email, env);
      if (!partner) throw new Error("Parceiro não encontrado ou sem acesso habilitado.");
      const key = `partner-code:${await hmacHex(partner.id, env.CODE_PEPPER)}`;
      await env.PORTAL_KV.put(key, JSON.stringify({ active: false, blockedAt: new Date().toISOString() }));
      state.partnerMessage = "Acesso bloqueado com sucesso.";
    } else {
      throw new Error("Ação inválida.");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível concluir.";
    if (action.startsWith("parceiro-")) state.partnerMessage = message;
    else state.clientMessage = message;
  }

  return adminPage(request, env, state);
}

async function adminPage(request, env, state = {}) {
  const assetUrl = new URL(request.url);
  assetUrl.pathname = "/administracao.html";
  const response = await env.ASSETS.fetch(new Request(assetUrl));
  if (!response.ok) return response;
  let html = await response.text();
  const values = {
    "%%CLIENT_MESSAGE%%": escapeHtml(state.clientMessage || ""),
    "%%CLIENT_CODE%%": escapeHtml(state.clientCode || ""),
    "%%CLIENT_VISIBLE%%": state.clientCode ? "visible" : "",
    "%%PARTNER_MESSAGE%%": escapeHtml(state.partnerMessage || ""),
    "%%PARTNER_CODE%%": escapeHtml(state.partnerCode || ""),
    "%%PARTNER_VISIBLE%%": state.partnerCode ? "visible" : "",
  };
  Object.entries(values).forEach(([key, value]) => { html = html.replaceAll(key, value); });
  return new Response(html, { status: 200, headers: securityHeaders({ "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }) });
}

async function protectedAsset(request, env, pathname) {
  const assetUrl = new URL(request.url);
  assetUrl.pathname = pathname;
  const response = await env.ASSETS.fetch(new Request(assetUrl));
  if (!response.ok) return response;
  return new Response(response.body, {
    status: response.status,
    headers: securityHeaders({ "Content-Type": response.headers.get("Content-Type") || "text/html; charset=utf-8", "Cache-Control": "no-store" }),
  });
}

async function storeClientCode(cpf, env) {
  const code = randomCode();
  const salt = randomHex(16);
  const hash = await pbkdf2Hex(`${normalizeCode(code)}:${env.CODE_PEPPER}`, salt);
  const key = `code:${await hmacHex(cpf, env.CODE_PEPPER)}`;
  await env.PORTAL_KV.put(key, JSON.stringify({ salt, hash, active: true, createdAt: new Date().toISOString() }));
  return code;
}

async function storePartnerCode(partnerId, env) {
  const code = randomCode();
  const salt = randomHex(16);
  const hash = await pbkdf2Hex(`${normalizeCode(code)}:${env.CODE_PEPPER}`, salt);
  const key = `partner-code:${await hmacHex(partnerId, env.CODE_PEPPER)}`;
  await env.PORTAL_KV.put(key, JSON.stringify({ salt, hash, active: true, createdAt: new Date().toISOString() }));
  return code;
}

async function loginCliente(request, env) {
  const body = await readJson(request);
  const cpf = digits(body.cpf);
  const code = normalizeCode(body.codigo);
  if (cpf.length !== 11 || code.length !== 8) return json({ error: "CPF ou código inválido." }, 400);

  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const attemptKey = `attempt:${await digestHex(`${ip}:${cpf}`)}`;
  const attempts = Number((await env.PORTAL_KV.get(attemptKey)) || 0);
  if (attempts >= MAX_ATTEMPTS) return json({ error: "Muitas tentativas. Aguarde 15 minutos." }, 429);

  if (!(await validateTurnstile(body.turnstileToken, ip, env))) {
    return json({ error: "Não foi possível validar a segurança da consulta." }, 400);
  }

  const codeKey = `code:${await hmacHex(cpf, env.CODE_PEPPER)}`;
  const stored = await env.PORTAL_KV.get(codeKey, "json");
  const valid = stored?.active && (await verifyCode(code, stored, env.CODE_PEPPER));
  if (!valid) {
    await env.PORTAL_KV.put(attemptKey, String(attempts + 1), { expirationTtl: BLOCK_SECONDS });
    return json({ error: "CPF ou código inválido." }, 401);
  }

  await env.PORTAL_KV.delete(attemptKey);
  const session = await createSession({ role: "cliente", cpf }, env.SESSION_SECRET);
  return json({ ok: true }, 200, { "Set-Cookie": sessionCookie("premium_cliente_session", session) });
}

async function processoCliente(request, env) {
  const token = cookieValue(request, "premium_cliente_session");
  const payload = token && (await verifySession(token, env.SESSION_SECRET));
  if (!payload || payload.role !== "cliente") return json({ error: "Sua sessão expirou. Entre novamente." }, 401);

  const fields = await airtableProcess(payload.cpf, env);
  if (!fields) return json({ error: "Nenhum processo foi encontrado para este CPF." }, 404);

  const status = selectText(fields["Status do Processo"]);
  const analystIds = Array.isArray(fields["Analista Responsável"]) ? fields["Analista Responsável"] : [];
  const analyst = await analystNames(analystIds, env);
  return json({
    nome: fields["Cliente Proponente"] || "Não informado",
    valor: brl(fields.VALOR),
    banco: selectText(fields.Banco),
    status,
    analista: analyst,
    observacoes: fields["Atualização"] || "Não informado",
    etapa: stageIndex(status),
  });
}

async function gerarCodigoCliente(request, env) {
  if (!(await authorizedAdmin(request, env))) return json({ error: "Não autorizado." }, 401);

  const body = await readJson(request);
  const cpf = digits(body.cpf);
  if (cpf.length !== 11) return json({ error: "CPF inválido." }, 400);
  if (!(await airtableProcess(cpf, env))) return json({ error: "CPF não localizado na tabela Andamento." }, 404);

  const code = await storeClientCode(cpf, env);
  return json({ codigo: code });
}

async function loginParceiro(request, env) {
  const body = await readJson(request);
  const email = normalizeEmail(body.email);
  const code = normalizeCode(body.codigo);
  if (!validEmail(email) || code.length !== 8) return json({ error: "E-mail ou código inválido." }, 400);

  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const attemptKey = `attempt:partner:${await digestHex(`${ip}:${email}`)}`;
  const attempts = Number((await env.PORTAL_KV.get(attemptKey)) || 0);
  if (attempts >= MAX_ATTEMPTS) return json({ error: "Muitas tentativas. Aguarde 15 minutos." }, 429);
  if (!(await validateTurnstile(body.turnstileToken, ip, env))) return json({ error: "Não foi possível validar a segurança do acesso." }, 400);

  const partner = await airtablePartnerByEmail(email, env);
  if (!partner) return json({ error: "E-mail ou código inválido." }, 401);
  const codeKey = `partner-code:${await hmacHex(partner.id, env.CODE_PEPPER)}`;
  const stored = await env.PORTAL_KV.get(codeKey, "json");
  const valid = stored?.active && (await verifyCode(code, stored, env.CODE_PEPPER));
  if (!valid) {
    await env.PORTAL_KV.put(attemptKey, String(attempts + 1), { expirationTtl: BLOCK_SECONDS });
    return json({ error: "E-mail ou código inválido." }, 401);
  }

  await env.PORTAL_KV.delete(attemptKey);
  const session = await createSession({ role: "parceiro", partnerId: partner.id }, env.SESSION_SECRET);
  return json({ ok: true }, 200, { "Set-Cookie": sessionCookie("premium_parceiro_session", session) });
}

async function processosParceiro(request, env) {
  const token = cookieValue(request, "premium_parceiro_session");
  const payload = token && (await verifySession(token, env.SESSION_SECRET));
  if (!payload || payload.role !== "parceiro" || !payload.partnerId) return json({ error: "Sua sessão expirou. Entre novamente." }, 401);

  const partner = await airtableRecord(env.AIRTABLE_PARCEIROS_TABLE_ID, payload.partnerId, env);
  if (!partner?.fields?.["Acesso ao portal"]) return json({ error: "Este acesso não está habilitado." }, 403);
  const records = await airtableAllProcesses(env);
  const linked = records.filter((record) => Array.isArray(record.fields?.Indicação) && record.fields.Indicação.includes(payload.partnerId));
  const processos = await Promise.all(linked.map(async ({ fields }) => {
    const status = selectText(fields["Status do Processo"]);
    return {
      nome: fields["Cliente Proponente"] || "Não informado",
      banco: selectText(fields.Banco),
      produto: selectText(fields.PRODUTO),
      valor: typeof fields.VALOR === "number" ? fields.VALOR : 0,
      valorFormatado: brl(fields.VALOR),
      status,
      etapa: stageIndex(status),
      analista: await analystNames(Array.isArray(fields["Analista Responsável"]) ? fields["Analista Responsável"] : [], env),
      observacoes: fields.Atualização || "Não informado",
    };
  }));
  const finalizados = processos.filter((item) => item.status.trim().toLowerCase() === "finalizado").length;
  const assinatura = processos.filter((item) => item.status.trim().toLowerCase() === "assinatura/registro").length;
  return json({
    parceiro: partner.fields?.Nome || "Parceiro",
    total: processos.length,
    andamento: Math.max(0, processos.length - assinatura - finalizados),
    assinatura,
    finalizados,
    valorTotal: processos.reduce((sum, item) => sum + item.valor, 0),
    processos,
  });
}

async function gerarCodigoParceiro(request, env) {
  if (!(await authorizedAdmin(request, env))) return json({ error: "Não autorizado." }, 401);
  const body = await readJson(request);
  const email = normalizeEmail(body.email);
  if (!validEmail(email)) return json({ error: "E-mail inválido." }, 400);
  const partner = await airtablePartnerByEmail(email, env);
  if (!partner) return json({ error: "Parceiro não encontrado ou sem acesso habilitado." }, 404);
  const code = await storePartnerCode(partner.id, env);
  return json({ parceiro: partner.fields?.Nome || "Parceiro", codigo: code });
}

async function bloquearCliente(request, env) {
  if (!(await authorizedAdmin(request, env))) return json({ error: "Não autorizado." }, 401);
  const body = await readJson(request);
  const cpf = digits(body.cpf);
  if (cpf.length !== 11) return json({ error: "CPF inválido." }, 400);
  const key = `code:${await hmacHex(cpf, env.CODE_PEPPER)}`;
  await env.PORTAL_KV.put(key, JSON.stringify({ active: false, blockedAt: new Date().toISOString() }));
  return json({ ok: true });
}

async function bloquearParceiro(request, env) {
  if (!(await authorizedAdmin(request, env))) return json({ error: "Não autorizado." }, 401);
  const body = await readJson(request);
  const email = normalizeEmail(body.email);
  if (!validEmail(email)) return json({ error: "E-mail inválido." }, 400);
  const partner = await airtablePartnerByEmail(email, env);
  if (!partner) return json({ error: "Parceiro não encontrado ou sem acesso habilitado." }, 404);
  const key = `partner-code:${await hmacHex(partner.id, env.CODE_PEPPER)}`;
  await env.PORTAL_KV.put(key, JSON.stringify({ active: false, blockedAt: new Date().toISOString() }));
  return json({ ok: true, parceiro: partner.fields?.Nome || "Parceiro" });
}

async function airtableProcess(cpf, env) {
  const formula = `SUBSTITUTE(SUBSTITUTE(SUBSTITUTE({CPF},'.',''),'-',''),' ','')='${cpf}'`;
  const params = new URLSearchParams({ filterByFormula: formula, maxRecords: "1" });
  ["Cliente Proponente", "CPF", "Status do Processo", "Banco", "VALOR", "Atualização", "Analista Responsável"].forEach((field) => params.append("fields[]", field));
  const response = await fetch(`https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${env.AIRTABLE_TABLE_ID}?${params}`, {
    headers: { Authorization: `Bearer ${env.AIRTABLE_TOKEN}` },
  });
  if (!response.ok) throw new Error(`airtable_${response.status}`);
  const data = await response.json();
  return data.records?.[0]?.fields || null;
}

async function airtablePartnerByEmail(email, env) {
  const safe = email.replace(/'/g, "\\'");
  const formula = `AND(LOWER({E-mail})=LOWER('${safe}'),{Acesso ao portal}=1)`;
  const params = new URLSearchParams({ filterByFormula: formula, maxRecords: "1" });
  ["Nome", "E-mail", "Acesso ao portal"].forEach((field) => params.append("fields[]", field));
  const response = await fetch(`https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${env.AIRTABLE_PARCEIROS_TABLE_ID}?${params}`, { headers: airtableHeaders(env) });
  if (!response.ok) throw new Error(`airtable_partner_${response.status}`);
  return (await response.json()).records?.[0] || null;
}

async function airtableAllProcesses(env) {
  const records = [];
  let offset;
  do {
    const params = new URLSearchParams({ pageSize: "100" });
    if (offset) params.set("offset", offset);
    ["Cliente Proponente", "Status do Processo", "Banco", "PRODUTO", "VALOR", "Atualização", "Analista Responsável", "Indicação"].forEach((field) => params.append("fields[]", field));
    const response = await fetch(`https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${env.AIRTABLE_TABLE_ID}?${params}`, { headers: airtableHeaders(env) });
    if (!response.ok) throw new Error(`airtable_processes_${response.status}`);
    const data = await response.json();
    records.push(...(data.records || []));
    offset = data.offset;
  } while (offset);
  return records;
}

async function airtableRecord(tableId, recordId, env) {
  const response = await fetch(`https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${tableId}/${recordId}`, { headers: airtableHeaders(env) });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`airtable_record_${response.status}`);
  return response.json();
}

function airtableHeaders(env) { return { Authorization: `Bearer ${env.AIRTABLE_TOKEN}` }; }

async function analystNames(ids, env) {
  const names = await Promise.all(ids.map(async (id) => {
    const response = await fetch(`https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${env.AIRTABLE_ANALISTAS_TABLE_ID}/${id}`, {
      headers: { Authorization: `Bearer ${env.AIRTABLE_TOKEN}` },
    });
    if (!response.ok) return null;
    return (await response.json()).fields?.Name || null;
  }));
  return names.filter(Boolean).join(", ") || "Não informado";
}

async function validateTurnstile(token, ip, env) {
  if (!token) return false;
  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secret: env.TURNSTILE_SECRET, response: token, remoteip: ip }),
  });
  const result = await response.json();
  return result.success === true;
}

async function createSession(data, secret) {
  const payload = base64url(encoder.encode(JSON.stringify({ ...data, exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS })));
  return `${payload}.${await hmacBase64(payload, secret)}`;
}

async function verifySession(token, secret) {
  const [payload, signature] = token.split(".");
  if (!payload || !signature || !(await safeEqual(signature, await hmacBase64(payload, secret)))) return null;
  try {
    const parsed = JSON.parse(decoder.decode(base64urlDecode(payload)));
    return parsed.exp > Date.now() / 1000 ? parsed : null;
  } catch { return null; }
}

async function verifyCode(code, stored, pepper) {
  const candidate = await pbkdf2Hex(`${code}:${pepper}`, stored.salt);
  return safeEqual(candidate, stored.hash);
}

async function pbkdf2Hex(value, salt) {
  const material = await crypto.subtle.importKey("raw", encoder.encode(value), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: encoder.encode(salt), iterations: 100000 }, material, 256);
  return hex(new Uint8Array(bits));
}

async function hmacBase64(value, secret) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return base64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value))));
}

async function hmacHex(value, secret) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value))));
}

async function digestHex(value) {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));
}

async function safeEqual(a = "", b = "") {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function randomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const raw = Array.from(bytes, (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join("");
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

function randomHex(length) { return hex(crypto.getRandomValues(new Uint8Array(length))); }
function hex(bytes) { return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(""); }
function digits(value) { return String(value || "").replace(/\D/g, ""); }
function normalizeCode(value) { return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, ""); }
function normalizeEmail(value) { return String(value || "").trim().toLowerCase(); }
function validEmail(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value); }
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]); }
function selectText(value) { return typeof value === "object" && value ? value.name || "Não informado" : value || "Não informado"; }
function brl(value) { return typeof value === "number" ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value) : "Não informado"; }
function stageIndex(value) {
  const key = String(value || "").trim().toLowerCase();
  return ({ "prospecção": 0, "urgente": 0, "checklist 1": 1, "avaliação": 2, "checklist 2": 3, "análise jurídica": 4, "assinatura/registro": 5, "finalizado": 6 })[key] ?? 0;
}

function cookieValue(request, name) {
  const match = request.headers.get("Cookie")?.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}
function sessionCookie(name, value) { return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_SECONDS}`; }
function clearCookie(name) { return `${name}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`; }
async function authorizedAdmin(request, env) {
  const bearer = request.headers.get("Authorization") || "";
  if (env.ADMIN_SECRET && (await safeEqual(bearer, `Bearer ${env.ADMIN_SECRET}`))) return true;
  return validateAccessJwt(request.headers.get("Cf-Access-Jwt-Assertion"), env);
}
async function validateAccessJwt(token, env) {
  if (!token || !env.ACCESS_AUD || !env.ADMIN_EMAILS) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  try {
    const header = JSON.parse(decoder.decode(base64urlDecode(parts[0])));
    const payload = JSON.parse(decoder.decode(base64urlDecode(parts[1])));
    const issuer = String(payload.iss || "").replace(/\/$/, "");
    if (!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/i.test(issuer)) return false;
    const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    const allowedAudiences = env.ACCESS_AUD.split(",").map((value) => value.trim()).filter(Boolean);
    const allowedEmails = env.ADMIN_EMAILS.split(",").map(normalizeEmail);
    if (payload.exp <= Date.now() / 1000 || !audiences.some((value) => allowedAudiences.includes(value)) || !allowedEmails.includes(normalizeEmail(payload.email))) return false;
    const response = await fetch(`${issuer}/cdn-cgi/access/certs`, { cf: { cacheTtl: 3600, cacheEverything: true } });
    if (!response.ok) return false;
    const jwk = (await response.json()).keys?.find((key) => key.kid === header.kid);
    if (!jwk || header.alg !== "RS256") return false;
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const signed = encoder.encode(`${parts[0]}.${parts[1]}`);
    return crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, base64urlDecode(parts[2]), signed);
  } catch { return false; }
}
async function asset(request, env, pathname) {
  const url = new URL(request.url);
  url.pathname = pathname;
  const response = await env.ASSETS.fetch(new Request(url, request));
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers: securityHeaders(response.headers) });
}
async function readJson(request) {
  if (!request.headers.get("Content-Type")?.includes("application/json")) throw new Error("invalid_content_type");
  return request.json();
}
function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), { status, headers: securityHeaders({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extra }) });
}
function sameOriginSubmission(request) {
  const origin = request.headers.get("Origin");
  const fetchSite = request.headers.get("Sec-Fetch-Site");
  return (!origin || origin === new URL(request.url).origin) && fetchSite !== "cross-site";
}
function securityHeaders(initial = {}) {
  const headers = new Headers(initial);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  headers.set("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
  return headers;
}
function base64url(bytes) {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function base64urlDecode(value) {
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
