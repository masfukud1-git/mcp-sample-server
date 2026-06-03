import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import os from 'os';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const API_KEY = process.env.API_KEY || 'default-api-key';

app.use(express.json({ limit: '10mb' }));
app.use(cors({ origin: '*', credentials: true }));

// リクエストログ
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// 認証ミドルウェア（healthは除外）
function authenticate(req, res, next) {
  // Cisco Secure AccessのAI Semantic InspectionはAPI Keyヘッダーを
  // 検査対象トラフィックに含めるため、認証は維持する
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== API_KEY) {
    return res.status(401).json(jsonRpcError(null, -32000, 'Unauthorized'));
  }
  next();
}

// ===== JSON-RPC 2.0 ヘルパー =====
function jsonRpcSuccess(id, result) {
  return { jsonrpc: '2.0', id, result };
}

function jsonRpcError(id, code, message, data) {
  return { jsonrpc: '2.0', id, error: { code, message, ...(data && { data }) } };
}

// ===== ツール定義 =====
const TOOLS = [
  {
    name: 'get_current_time',
    description: '現在の日時を取得する',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'get_weather',
    description: '指定した都市の天気情報を取得する（ダミーデータ）',
    inputSchema: {
      type: 'object',
      properties: {
        location: { type: 'string', description: '都市名（例: Tokyo, Osaka）' }
      },
      required: ['location']
    }
  },
  {
    name: 'calculate',
    description: '簡単な四則演算を実行する',
    inputSchema: {
      type: 'object',
      properties: {
        expression: { type: 'string', description: '計算式（例: 10 + 5 * 2）' }
      },
      required: ['expression']
    }
  },
  {
    name: 'get_random_quote',
    description: 'ランダムな名言を返す',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'get_system_info',
    description: 'サーバーのシステム情報を取得する',
    inputSchema: { type: 'object', properties: {} }
  }
];

// ===== ツール実行ロジック =====
async function executeTool(name, args = {}) {
  switch (name) {
    case 'get_current_time': {
      const now = new Date();
      return {
        content: [{
          type: 'text',
          text: `現在時刻: ${now.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}\nタイムゾーン: Asia/Tokyo (JST)\nUnix timestamp: ${now.getTime()}\nISO 8601: ${now.toISOString()}`
        }]
      };
    }
    case 'get_weather': {
      const location = args.location || 'Unknown';
      const weathers = ['晴れ', '曇り', '雨', '雪', '快晴'];
      const weather = weathers[Math.floor(Math.random() * weathers.length)];
      const temp = Math.floor(Math.random() * 30) + 5;
      return {
        content: [{
          type: 'text',
          text: `${location}の天気情報:\n天気: ${weather}\n気温: ${temp}°C\n湿度: ${Math.floor(Math.random() * 50) + 30}%\n※これはダミーデータです`
        }]
      };
    }
    case 'calculate': {
      const expr = args.expression || '';
      if (!/^[\d\s\+\-\*\/\(\)\.]+$/.test(expr)) {
        return {
          content: [{ type: 'text', text: '計算エラー: 無効な式です。数字と演算子のみ使用できます。' }],
          isError: true
        };
      }
      try {
        // eslint-disable-next-line no-eval
        const result = Function('"use strict"; return (' + expr + ')')();
        return { content: [{ type: 'text', text: `${expr} = ${result}` }] };
      } catch {
        return { content: [{ type: 'text', text: '計算エラー: 式の評価に失敗しました。' }], isError: true };
      }
    }
    case 'get_random_quote': {
      const quotes = [
        { text: 'Stay hungry, stay foolish.', author: 'Steve Jobs' },
        { text: 'The only way to do great work is to love what you do.', author: 'Steve Jobs' },
        { text: 'In the middle of every difficulty lies opportunity.', author: 'Albert Einstein' },
        { text: 'It does not matter how slowly you go as long as you do not stop.', author: 'Confucius' },
        { text: 'Life is what happens when you\'re busy making other plans.', author: 'John Lennon' }
      ];
      const q = quotes[Math.floor(Math.random() * quotes.length)];
      return { content: [{ type: 'text', text: `"${q.text}"\n― ${q.author}` }] };
    }
    case 'get_system_info': {
      return {
        content: [{
          type: 'text',
          text: `OS: ${os.platform()} ${os.release()}\nArch: ${os.arch()}\nNode.js: ${process.version}\nUptime: ${Math.floor(os.uptime() / 3600)}h ${Math.floor((os.uptime() % 3600) / 60)}m\nMemory: ${(os.freemem() / 1024 / 1024 / 1024).toFixed(2)}GB free / ${(os.totalmem() / 1024 / 1024 / 1024).toFixed(2)}GB total`
        }]
      };
    }
    default:
      throw { code: -32601, message: `Unknown tool: ${name}` };
  }
}

// ===== ヘルスチェック（認証不要）=====
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '2.0.0', server: 'mcp-jsonrpc-server' });
});

// ===== MCP JSON-RPC 2.0 エンドポイント（単一エンドポイント）=====
app.post('/mcp', authenticate, async (req, res) => {
  const { jsonrpc, method, params, id } = req.body;

  // JSON-RPC バリデーション
  if (jsonrpc !== '2.0') {
    return res.status(400).json(jsonRpcError(id ?? null, -32600, 'Invalid Request: jsonrpc must be "2.0"'));
  }
  if (!method) {
    return res.status(400).json(jsonRpcError(id ?? null, -32600, 'Invalid Request: method is required'));
  }

  console.log(`[MCP] method=${method} id=${id}`);

  try {
    switch (method) {
      // --- initialize ---
      case 'initialize':
        return res.json(jsonRpcSuccess(id, {
          protocolVersion: '2024-11-05',
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'mcp-jsonrpc-server', version: '2.0.0' }
        }));

      // --- notifications/initialized ---
      case 'notifications/initialized':
        return res.status(204).end();

      // --- tools/list ---
      case 'tools/list':
        return res.json(jsonRpcSuccess(id, { tools: TOOLS }));

      // --- tools/call ---
      case 'tools/call': {
        const toolName = params?.name;
        const toolArgs = params?.arguments ?? {};
        if (!toolName) {
          return res.json(jsonRpcError(id, -32602, 'Invalid params: name is required'));
        }
        const toolExists = TOOLS.some(t => t.name === toolName);
        if (!toolExists) {
          return res.json(jsonRpcError(id, -32601, `Tool not found: ${toolName}`));
        }
        const result = await executeTool(toolName, toolArgs);
        return res.json(jsonRpcSuccess(id, result));
      }

      // --- ping ---
      case 'ping':
        return res.json(jsonRpcSuccess(id, {}));

      default:
        return res.json(jsonRpcError(id, -32601, `Method not found: ${method}`));
    }
  } catch (err) {
    console.error(`[MCP] Error: ${err.message || JSON.stringify(err)}`);
    return res.json(jsonRpcError(id, err.code ?? -32000, err.message ?? 'Internal error'));
  }
});

// 404
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// サーバー起動
const server = app.listen(PORT, HOST, () => {
  console.log('='.repeat(50));
  console.log('MCP JSON-RPC 2.0 Server');
  console.log(`URL: http://${HOST}:${PORT}`);
  console.log(`Endpoints:`);
  console.log(`  GET  /health  - Health check (no auth)`);
  console.log(`  POST /mcp     - JSON-RPC 2.0 endpoint`);
  console.log('='.repeat(50));
});

server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;
