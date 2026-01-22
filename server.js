import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import os from 'os';
import { execSync } from 'child_process';

// 環境変数読み込み
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const API_KEY = process.env.API_KEY || 'demo-api-key-12345';

// ミドルウェア
app.use(express.json({ limit: '10mb' }));
app.use(cors());

// リクエストログ
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// 認証ミドルウェア
function authenticate(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey) {
    return res.status(401).json({ 
      error: 'Unauthorized',
      message: 'API key required in X-API-Key header'
    });
  }
  
  if (apiKey !== API_KEY) {
    return res.status(401).json({ 
      error: 'Unauthorized',
      message: 'Invalid API key'
    });
  }
  
  next();
}

// ===== MCPツール実装 =====

// 天気情報取得（ダミーデータ）
function getWeather(location) {
  const weatherData = {
    '東京': { temp: 18, condition: '晴れ', humidity: 60 },
    'Tokyo': { temp: 18, condition: 'Sunny', humidity: 60 },
    '大阪': { temp: 20, condition: '曇り', humidity: 65 },
    'Osaka': { temp: 20, condition: 'Cloudy', humidity: 65 },
    '福岡': { temp: 22, condition: '雨', humidity: 80 },
    'Fukuoka': { temp: 22, condition: 'Rainy', humidity: 80 }
  };
  
  const weather = weatherData[location] || { 
    temp: 15, 
    condition: '不明', 
    humidity: 50 
  };
  
  return {
    content: [{
      type: "text",
      text: `${location}の天気情報:
気温: ${weather.temp}°C
天候: ${weather.condition}
湿度: ${weather.humidity}%

※これはダミーデータです`
    }]
  };
}

// 現在時刻取得
function getCurrentTime() {
  const now = new Date();
  return {
    content: [{
      type: "text",
      text: `現在時刻: ${now.toLocaleString('ja-JP', { 
        timeZone: 'Asia/Tokyo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      })}

タイムゾーン: Asia/Tokyo (JST)
Unix timestamp: ${now.getTime()}
ISO 8601: ${now.toISOString()}`
    }]
  };
}

// システム情報取得
function getSystemInfo() {
  const cpus = os.cpus();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  
  return {
    content: [{
      type: "text",
      text: `システム情報:

ホスト名: ${os.hostname()}
プラットフォーム: ${os.platform()} ${os.release()}
アーキテクチャ: ${os.arch()}
CPU: ${cpus[0].model}
コア数: ${cpus.length}
総メモリ: ${(totalMem / 1024 / 1024 / 1024).toFixed(2)} GB
空きメモリ: ${(freeMem / 1024 / 1024 / 1024).toFixed(2)} GB
使用メモリ: ${(usedMem / 1024 / 1024 / 1024).toFixed(2)} GB (${((usedMem / totalMem) * 100).toFixed(1)}%)
稼働時間: ${(os.uptime() / 3600).toFixed(2)} 時間`
    }]
  };
}

// 簡単な計算機
function calculate(expression) {
  try {
    // 安全な評価のため、許可された文字のみ
    if (!/^[\d\s+\-*/().]+$/.test(expression)) {
      throw new Error('無効な式です。数字と演算子のみ使用できます。');
    }
    
    const result = eval(expression);
    
    return {
      content: [{
        type: "text",
        text: `計算結果:
式: ${expression}
答え: ${result}`
      }]
    };
  } catch (error) {
    return {
      content: [{
        type: "text",
        text: `計算エラー: ${error.message}`
      }],
      isError: true
    };
  }
}

// ランダムな引用
function getRandomQuote() {
  const quotes = [
    { text: "Learn from yesterday, live for today, hope for tomorrow.", author: "Albert Einstein" },
    { text: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
    { text: "Innovation distinguishes between a leader and a follower.", author: "Steve Jobs" },
    { text: "Stay hungry, stay foolish.", author: "Steve Jobs" },
    { text: "The future belongs to those who believe in the beauty of their dreams.", author: "Eleanor Roosevelt" }
  ];
  
  const quote = quotes[Math.floor(Math.random() * quotes.length)];
  
  return {
    content: [{
      type: "text",
      text: `"${quote.text}"\n\n― ${quote.author}`
    }]
  };
}

// ===== APIエンドポイント =====

// ヘルスチェック（認証不要）
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    server: 'mcp-sample-server'
  });
});

// MCP初期化
app.post('/mcp/initialize', authenticate, (req, res) => {
  res.json({
    protocolVersion: "2024-11-05",
    capabilities: { 
      tools: {}
    },
    serverInfo: { 
      name: "mcp-sample-server", 
      version: "1.0.0" 
    }
  });
});

// ツール一覧
app.get('/mcp/tools/list', authenticate, (req, res) => {
  res.json({
    tools: [
      {
        name: "get_weather",
        description: "指定された場所の天気情報を取得（ダミーデータ）",
        inputSchema: {
          type: "object",
          properties: {
            location: { 
              type: "string", 
              description: "場所（東京、大阪、福岡など）" 
            }
          },
          required: ["location"]
        }
      },
      {
        name: "get_current_time",
        description: "現在の日時を取得",
        inputSchema: { 
          type: "object", 
          properties: {} 
        }
      },
      {
        name: "get_system_info",
        description: "サーバーのシステム情報を取得",
        inputSchema: { 
          type: "object", 
          properties: {} 
        }
      },
      {
        name: "calculate",
        description: "簡単な数式を計算",
        inputSchema: {
          type: "object",
          properties: {
            expression: { 
              type: "string", 
              description: "計算式（例: 2 + 2, 10 * 5 - 3）" 
            }
          },
          required: ["expression"]
        }
      },
      {
        name: "get_random_quote",
        description: "ランダムな名言を取得",
        inputSchema: { 
          type: "object", 
          properties: {} 
        }
      }
    ]
  });
});

// ツール実行
app.post('/mcp/tools/call', authenticate, (req, res) => {
  const { name, arguments: args } = req.body;
  
  if (!name) {
    return res.status(400).json({ 
      error: 'Bad request',
      message: 'Tool name is required' 
    });
  }
  
  console.log(`[Tool] Executing: ${name}`, args);
  
  let result;
  
  try {
    switch (name) {
      case 'get_weather':
        result = getWeather(args.location);
        break;
        
      case 'get_current_time':
        result = getCurrentTime();
        break;
        
      case 'get_system_info':
        result = getSystemInfo();
        break;
        
      case 'calculate':
        result = calculate(args.expression);
        break;
        
      case 'get_random_quote':
        result = getRandomQuote();
        break;
        
      default:
        return res.status(400).json({ 
          error: 'Unknown tool',
          message: `Tool '${name}' not found` 
        });
    }
    
    res.json(result);
  } catch (error) {
    console.error(`[Tool Error] ${name}:`, error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
});

// サーバー情報
app.get('/mcp/info', authenticate, (req, res) => {
  res.json({
    serverInfo: {
      name: "mcp-sample-server",
      version: "1.0.0",
      hostname: os.hostname(),
      platform: os.platform(),
      nodeVersion: process.version
    },
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
});

// 404ハンドラ
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Not found',
    message: 'Endpoint not found' 
  });
});

// エラーハンドラ
app.use((err, req, res, next) => {
  console.error('[Server Error]:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: err.message 
  });
});

// サーバー起動
const server = app.listen(PORT, HOST, () => {
  console.log('='.repeat(60));
  console.log('MCP Sample Server');
  console.log('='.repeat(60));
  console.log(`URL: http://${HOST}:${PORT}`);
  console.log(`API Key: ${API_KEY}`);
  console.log('='.repeat(60));
  console.log('\nAvailable endpoints:');
  console.log('  GET  /health                 - Health check');
  console.log('  POST /mcp/initialize         - Initialize MCP');
  console.log('  GET  /mcp/tools/list         - List tools');
  console.log('  POST /mcp/tools/call         - Call tool');
  console.log('  GET  /mcp/info               - Server info');
  console.log('='.repeat(60));
  console.log('\nServer is ready!');
});

// グレースフルシャットダウン
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, closing server...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});