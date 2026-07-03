import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
// 【修正】onValue の代わりに child, get, onChildAdded をインポート
import { getDatabase, ref, push, remove, onChildAdded, get, child } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-database.js";

// Firebaseの設定値
const firebaseConfig = {
  apiKey: "AIzaSyCaWvMwLNWaaJJ9KOc04v370rxBf9dOAqY",
  authDomain: "web-systemd.firebaseapp.com",
  databaseURL: "https://web-systemd-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "web-systemd",
  storageBucket: "web-systemd.firebasestorage.app",
  messagingSenderId: "338748900323",
  appId: "1:338748900323:web:17fdddd53921d09bf6d6d6",
  measurementId: "G-1B6WS54TLY",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const database = getDatabase(app);
const ordersRef = ref(database, "orders");

// 状態管理
const state = {
  currentPage: document.body.dataset.page, // "staff" または "hq"
  authMode: document.body.dataset.auth || "required", // "none" または "required"
  hqUnlocked: false,
  orders: [], // 取得した注文の一覧
  cart: [],
  selectedDepartment: "cafe",
  tableNumber: "",
};

// マスタデータ（各部門の商品と金券）
const DEPARTMENTS = {
  cafe: {
    name: "カフェ",
    items: [
      { id: "c1", name: "アイスコーヒー", price: 200 },
      { id: "c2", name: "クッキー", price: 150 },
    ],
    tickets: [
      { id: "t1", name: "100円金券", value: 100 },
      { id: "t2", name: "50円金券", value: 50 },
    ],
  },
  goods: {
    name: "物販",
    items: [
      { id: "g1", name: "Tシャツ", price: 1500 },
      { id: "g2", name: "タオル", price: 800 },
    ],
    tickets: [
      { id: "t1", name: "100円金券", value: 100 },
    ],
  },
};

// --- 共通UI処理 ---
function showToast(message) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 3000);
}

// --- 認証共通ロジック ---
function initAuthGate({ onSignedIn, onSignedOut }) {
  if (state.authMode === "none") {
    // 認証なしモードの場合は即座にサインイン状態のUIへ
    setTimeout(onSignedIn, 0);
    return;
  }
  
  const authForm = document.getElementById("authForm");
  const authMessage = document.getElementById("authMessage") || document.getElementById("loginMessage");
  const logoutButton = document.getElementById("logoutButton");

  onAuthStateChanged(auth, (user) => {
    if (user) {
      document.getElementById("authPanel")?.classList.add("hidden");
      logoutButton?.classList.remove("hidden");
      onSignedIn();
    } else {
      document.getElementById("authPanel")?.classList.remove("hidden");
      logoutButton?.classList.add("hidden");
      onSignedOut();
    }
  });

  authForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("authEmail").value;
    const password = document.getElementById("authPassword").value;
    if (authMessage) authMessage.textContent = "";
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      if (authMessage) {
        authMessage.textContent = "ログインに失敗しました。";
        authMessage.className = "status-text warn";
      }
    }
  });

  logoutButton?.addEventListener("click", () => {
    signOut(auth).catch(console.error);
  });
}

// --- 店員用画面 (Staff) のロジック ---
function initStaffPage() {
  const els = {
    app: document.getElementById("staffApp"),
    deptList: document.getElementById("departmentList"),
    deptName: document.getElementById("selectedDepartmentName"),
    tableNum: document.getElementById("tableNumber"),
    menuGrid: document.getElementById("menuGrid"),
    ticketGrid: document.getElementById("ticketGrid"),
    cartList: document.getElementById("cartList"),
    itemTotal: document.getElementById("itemTotal"),
    ticketTotal: document.getElementById("ticketTotal"),
    balanceTotal: document.getElementById("balanceTotal"),
    paymentStatus: document.getElementById("paymentStatus"),
    openConfirm: document.getElementById("openConfirmButton"),
    confirmDialog: document.getElementById("confirmDialog"),
    confirmDetails: document.getElementById("confirmDetails"),
    sendOrder: document.getElementById("sendOrderButton"),
    resetOrder: document.getElementById("resetOrderButton"),
  };

  // 部門タブの生成
  Object.keys(DEPARTMENTS).forEach((id) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `dept-tab ${id === state.selectedDepartment ? "active" : ""}`;
    btn.textContent = DEPARTMENTS[id].name;
    btn.addEventListener("click", () => {
      state.selectedDepartment = id;
      document.querySelectorAll(".dept-tab").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      state.cart = [];
      renderStaffAll();
    });
    els.deptList.appendChild(btn);
  });

  function getTotals() {
    let itemSum = 0;
    let ticketSum = 0;
    state.cart.forEach(cartItem => {
      if (cartItem.type === "item") {
        itemSum += cartItem.price * cartItem.quantity;
      } else if (cartItem.type === "ticket") {
        ticketSum += cartItem.value * cartItem.quantity;
      }
    });
    return { itemSum, ticketSum, balance: itemSum - ticketSum };
  }

  function renderStaffAll() {
    els.deptName.textContent = DEPARTMENTS[state.selectedDepartment].name;
    
    // メニュー描画
    els.menuGrid.innerHTML = "";
    DEPARTMENTS[state.selectedDepartment].items.forEach(item => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "menu-card";
      card.innerHTML = `<span>${item.name}</span><strong>${item.price}円</strong>`;
      card.addEventListener("click", () => addToCart(item, "item"));
      els.menuGrid.appendChild(card);
    });

    // 金券描画
    els.ticketGrid.innerHTML = "";
    DEPARTMENTS[state.selectedDepartment].tickets.forEach(tk => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "menu-card ticket";
      card.innerHTML = `<span>${tk.name}</span><strong>${tk.value}円</strong>`;
      card.addEventListener("click", () => addToCart(tk, "ticket"));
      els.ticketGrid.appendChild(card);
    });

    // カート・計算描画
    els.cartList.innerHTML = "";
    state.cart.forEach(cartItem => {
      const li = document.createElement("li");
      li.className = "cart-item";
      const label = cartItem.type === "ticket" ? `[金券] ${cartItem.name}` : cartItem.name;
      li.innerHTML = `
        <span class="cart-item-name">${label}</span>
        <div class="qty-controls">
          <button type="button" class="qty-btn" data-dir="-1">-</button>
          <span>${cartItem.quantity}</span>
          <button type="button" class="qty-btn" data-dir="1">+</button>
        </div>
      `;
      li.querySelectorAll(".qty-btn").forEach(btn => {
        btn.addEventListener("click", () => {
          const dir = parseInt(btn.dataset.dir);
          cartItem.quantity += dir;
          if (cartItem.quantity <= 0) {
            state.cart = state.cart.filter(c => c !== cartItem);
          }
          renderStaffAll();
        });
      });
      els.cartList.appendChild(li);
    });

    const { itemSum, ticketSum, balance } = getTotals();
    els.itemTotal.textContent = `${itemSum}円`;
    els.ticketTotal.textContent = `${ticketSum}円`;
    els.balanceTotal.textContent = `${balance}円`;

    if (state.cart.length === 0) {
      els.paymentStatus.textContent = "商品を選択してください";
      els.paymentStatus.className = "status-text";
      els.openConfirm.disabled = true;
    } else if (balance < 0) {
      els.paymentStatus.textContent = `金券が多すぎます（お釣りは出ません: ${Math.abs(balance)}円超過）`;
      els.paymentStatus.className = "status-text warn";
      els.openConfirm.disabled = false;
    } else if (balance === 0) {
      els.paymentStatus.textContent = "金券ぴったりです。現金の受け渡しはありません。";
      els.paymentStatus.className = "status-text success";
      els.openConfirm.disabled = false;
    } else {
      els.paymentStatus.textContent = `現金で ${balance} 円を受け取ってください。`;
      els.paymentStatus.className = "status-text action";
      els.openConfirm.disabled = false;
    }
  }

  function addToCart(target, type) {
    const existing = state.cart.find(c => c.id === target.id && c.type === type);
    if (existing) {
      existing.quantity++;
    } else {
      state.cart.push({ ...target, type, quantity: 1 });
    }
    renderStaffAll();
  }

  els.tableNum.addEventListener("input", (e) => {
    state.tableNumber = e.target.value.trim();
  });

  els.openConfirm.addEventListener("click", () => {
    const { itemSum, ticketSum, balance } = getTotals();
    let detailsHtml = `
      <p><strong>部門:</strong> ${DEPARTMENTS[state.selectedDepartment].name}</p>
      <p><strong>座席/卓番号:</strong> ${state.tableNumber || "未入力"}</p>
      <hr style="border:0; border-top:1px solid var(--line); margin:12px 0;">
      <ul style="padding-left:20px; margin:0 0 12px 0;">
    `;
    state.cart.forEach(c => {
      const label = c.type === "ticket" ? `[金券] ${c.name}` : c.name;
      detailsHtml += `<li>${label} x ${c.quantity}</li>`;
    });
    detailsHtml += `
      </ul>
      <p>商品合計: ${itemSum}円</p>
      <p>金券合計: ${ticketSum}円</p>
      <p style="font-size:1.15rem; color:var(--brand-dark);"><strong>会計差額: ${balance}円</strong></p>
    `;
    els.confirmDetails.innerHTML = detailsHtml;
    els.confirmDialog.showModal();
  });

  els.sendOrder.addEventListener("click", async () => {
    els.sendOrder.disabled = true;
    const { itemSum, ticketSum, balance } = getTotals();
    const orderData = {
      department: state.selectedDepartment,
      departmentName: DEPARTMENTS[state.selectedDepartment].name,
      tableNumber: state.tableNumber,
      items: state.cart,
      itemTotal: itemSum,
      ticketTotal: ticketSum,
      balanceTotal: balance,
      timestamp: Date.now(),
    };

    try {
      await push(ordersRef, orderData);
      showToast("注文を送信しました！");
      state.cart = [];
      state.tableNumber = "";
      els.tableNum.value = "";
      els.confirmDialog.close();
      renderStaffAll();
    } catch (error) {
      console.error(error);
      alert("送信に失敗しました。オンライン環境を確認してください。");
    } finally {
      els.sendOrder.disabled = false;
    }
  });

  els.resetOrder.addEventListener("click", () => {
    if (window.confirm("現在の入力をすべてクリアしますか？")) {
      state.cart = [];
      state.tableNumber = "";
      els.tableNum.value = "";
      renderStaffAll();
    }
  });

  initAuthGate({
    onSignedIn() { els.app.classList.remove("hidden"); renderStaffAll(); },
    onSignedOut() { els.app.classList.add("hidden"); }
  });
}

// --- 本部用画面 (HQ) のロジック ---
function initHqPage() {
  const els = {
    hqLogin: document.getElementById("hqLogin"),
    hqLoginForm: document.getElementById("hqLoginForm"),
    hqPassword: document.getElementById("hqPassword"),
    loginMessage: document.getElementById("loginMessage"),
    dashboard: document.getElementById("dashboard"),
    clearHistoryButton: document.getElementById("clearHistoryButton"),
    metricSales: document.getElementById("metricSales"),
    metricOrders: document.getElementById("metricOrders"),
    metricTickets: document.getElementById("metricTickets"),
    departmentSummary: document.getElementById("departmentSummary"),
    ticketSummary: document.getElementById("ticketSummary"),
    historyCount: document.getElementById("historyCount"),
    historyList: document.getElementById("historyList"),
  };

  let isListening = false;

  function renderDashboard() {
    if (!state.hqUnlocked) {
      els.dashboard.classList.add("hidden");
      return;
    }
    els.dashboard.classList.remove("hidden");

    let totalSales = 0;
    let totalTickets = 0;
    const deptMap = {};
    const ticketMap = {};

    Object.keys(DEPARTMENTS).forEach(id => {
      deptMap[id] = { name: DEPARTMENTS[id].name, sales: 0, count: 0 };
    });

    state.orders.forEach(order => {
      totalSales += (order.itemTotal || 0);
      totalTickets += (order.ticketTotal || 0);

      if (deptMap[order.department]) {
        deptMap[order.department].sales += (order.itemTotal || 0);
        deptMap[order.department].count += 1;
      }

      if (order.items && Array.isArray(order.items)) {
        order.items.forEach(c => {
          if (c.type === "ticket") {
            if (!ticketMap[c.name]) ticketMap[c.name] = { val: c.value, qty: 0 };
            ticketMap[c.name].qty += c.quantity;
          }
        });
      }
    });

    els.metricSales.textContent = `${totalSales}円`;
    els.metricOrders.textContent = state.orders.length;
    els.metricTickets.textContent = `${totalTickets}円`;

    // 部門別集計描画
    let deptHtml = `<table class=\"summary-table-el\"><thead><tr><th>部門名</th><th>売上</th><th>件数</th></tr></thead><tbody>`;
    Object.keys(deptMap).forEach(k => {
      deptHtml += `<tr><td>${deptMap[k].name}</td><td>${deptMap[k].sales}円</td><td>${deptMap[k].count}件</td></tr>`;
    });
    deptHtml += `</tbody></table>`;
    els.departmentSummary.innerHTML = deptHtml;

    // 金券集計描画
    let tktHtml = `<table class=\"summary-table-el\"><thead><tr><th>金券種別</th><th>額面</th><th>枚数</th><th>小計</th></tr></thead><tbody>`;
    const tktKeys = Object.keys(ticketMap);
    if (tktKeys.length === 0) {
      tktHtml += `<tr><td colspan=\"4\" style=\"text-align:center;color:var(--muted);\">金券利用なし</td></tr>`;
    } else {
      tktKeys.forEach(k => {
        const sub = ticketMap[k].val * ticketMap[k].qty;
        tktHtml += `<tr><td>${k}</td><td>${ticketMap[k].val}円</td><td>${ticketMap[k].qty}枚</td><td>${sub}円</td></tr>`;
      });
    }
    tktHtml += `</tbody></table>`;
    els.ticketSummary.innerHTML = tktHtml;

    // 履歴リスト描画（新しい注文を上に）
    els.historyCount.textContent = `${state.orders.length}件`;
    els.historyList.innerHTML = "";
    
    [...state.orders].reverse().forEach(order => {
      const timeStr = new Date(order.timestamp).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      const itemNames = order.items ? order.items.map(i => `${i.name}x${i.quantity}`).join(", ") : "";
      
      const div = document.createElement("div");
      div.className = "history-item";
      div.innerHTML = `
        <div class=\"history-item-meta\">
          <span class=\"history-time\">${timeStr}</span>
          <span class=\"history-dept\">${order.departmentName || "不明"}</span>
          <span class=\"history-table\">${order.tableNumber ? order.tableNumber + "卓" : "持帰/無記名"}</span>
        </div>
        <div class=\"history-item-details\">${itemNames}</div>
        <div class=\"history-item-price\">売上: ${order.itemTotal}円 / 金券: ${order.ticketTotal}円 (差額: ${order.balanceTotal}円)</div>
      `;
      els.historyList.appendChild(div);
    });
  }

  // 【修正】本部画面がアクティブになったときに、通信量を最小化してデータを読み込む
  async function startListeningOrders() {
    if (isListening) return;
    isListening = true;

    state.orders = [];

    try {
      // 1. 最初に、現在データベースにある既存の注文データを「1回だけ」一括取得する (通信節約)
      const snapshot = await get(ordersRef);
      if (snapshot.exists()) {
        const initialData = snapshot.val();
        Object.keys(initialData).forEach(key => {
          state.orders.push({ id: key, ...initialData[key] });
        });
        // タイムスタンプ順にソートしておきます
        state.orders.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
        renderDashboard();
      }

      // 2. 以降は「新しく追加された注文のみ」をリアルタイムで1件ずつ受信する (onChildAdded)
      // これにより、新着注文が入るたびに全データを再ダウンロードする無駄が完全になくなります。
      onChildAdded(ordersRef, (childSnapshot) => {
        const newOrderId = childSnapshot.key;
        // すでに最初の一括取得で読み込み済みのデータはスキップする
        const exists = state.orders.some(o => o.id === newOrderId);
        if (!exists) {
          state.orders.push({ id: newOrderId, ...childSnapshot.val() });
          renderDashboard();
        }
      });

    } catch (err) {
      console.error("データ取得エラー:", err);
    }
  }

  els.hqLoginForm.addEventListener("submit", (e) => {
    e.preventDefault();
    if (els.hqPassword.value === "honbu2026") {
      state.hqUnlocked = true;
      els.hqLogin.classList.add("hidden");
      els.loginMessage.textContent = "";
      startListeningOrders();
      renderDashboard();
    } else {
      els.loginMessage.textContent = "パスワードが違います";
      els.loginMessage.className = "status-text warn";
    }
  });

  els.clearHistoryButton.addEventListener("click", async () => {
    if (!state.hqUnlocked || state.orders.length === 0) return;
    const ok = window.confirm("注文履歴をすべて削除しますか？\n(注意: データベースが空になり、本部の表示もリセットされます)");
    if (!ok) return;
    try {
      await remove(ordersRef);
      state.orders = []; // ローカルの状態も空にする
      renderDashboard();
      showToast("履歴をクリアしました");
    } catch (error) {
      console.error(error);
      els.loginMessage.textContent = "履歴クリアに失敗しました";
      els.loginMessage.className = "status-text warn";
    }
  });

  if (state.authMode === "none") {
    els.hqLogin.classList.remove("hidden");
  } else {
    initAuthGate({
      onSignedIn() {
        els.hqLogin.classList.remove("hidden");
      },
      onSignedOut() {
        isListening = false;
        state.hqUnlocked = false;
        state.orders = [];
        els.hqPassword.value = "";
        els.hqLogin.classList.add("hidden");
        els.dashboard.classList.add("hidden");
        renderDashboard();
      }
    });
  }
}

// --- 初期起動ルーティング ---
if (state.currentPage === "staff") {
  initStaffPage();
} else if (state.currentPage === "hq") {
  initHqPage();
}
