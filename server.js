const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

app.use(cors());
app.use(express.json());

// ★ ここが魔法の1行！同じフォルダにあるHTMLやJSを自動で配信します ★
app.use(express.static(__dirname));

// データ保存用のファイル(data.json)がなければ空で作る
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(DATA_FILE, JSON.stringify([]));
}

// 【API】注文データを取得（本部がダッシュボードを更新するときに呼ばれる）
app.get('/api/orders', (req, res) => {
  fs.readFile(DATA_FILE, 'utf8', (err, data) => {
    if (err) return res.status(500).json({ error: '読み込みエラー' });
    res.json(JSON.parse(data));
  });
});

// 【API】新しい注文を保存（店員が「送信」を押したときに呼ばれる）
app.post('/api/orders', (req, res) => {
  const newOrder = req.body;
  fs.readFile(DATA_FILE, 'utf8', (err, data) => {
    if (err) return res.status(500).json({ error: '読み込みエラー' });
    
    const orders = JSON.parse(data);
    orders.push(newOrder); // 注文を追加
    
    fs.writeFile(DATA_FILE, JSON.stringify(orders, null, 2), (err) => {
      if (err) return res.status(500).json({ error: '保存エラー' });
      res.json({ success: true });
    });
  });
});

// 【API】注文履歴をクリア（本部が「履歴クリア」を押したときに呼ばれる）
app.delete('/api/orders', (req, res) => {
  fs.writeFile(DATA_FILE, JSON.stringify([]), (err) => {
    if (err) return res.status(500).json({ error: '削除エラー' });
    res.json({ success: true });
  });
});

// サーバー起動
app.listen(PORT, () => {
  console.log(`\n✅ サーバーが起動しました！`);
  console.log(`🌍 Cloudflare Tunnelの設定は【 localhost:${PORT} 】に向けてください。`);
  console.log(`----------------------------------------------------`);
  console.log(`👤 店員用URL: http://localhost:${PORT}/staff-noauth.html`);
  console.log(`👑 本部用URL: http://localhost:${PORT}/hq-noauth.html`);
  console.log(`----------------------------------------------------\n`);
});