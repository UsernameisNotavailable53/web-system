import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import { getDatabase, onValue, push, ref, remove } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-database.js";

// この設定値はFirebaseのWebアプリ用設定です。秘密鍵ではないのでHTML/JS内で使えます。
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

const departments = [
  createDepartment({
    id: "cafe",
    name: "カフェ",
    note: "卓番号あり",
    requiresTable: true,
    menu: [
      { id: "coffee", name: "コーヒー", price: 200 },
      { id: "tea", name: "紅茶", price: 200 },
      { id: "cake", name: "ケーキ", price: 300 },
      { id: "set", name: "ドリンクセット", price: 450 },
    ],
  }),
  createDepartment({
    id: "illust",
    name: "イラスト販売",
    note: "本部直接入力",
    requiresTable: false,
    menu: [
      { id: "postcard", name: "ポストカード", price: 100 },
      { id: "sticker", name: "ステッカー", price: 150 },
      { id: "mini-print", name: "ミニ色紙", price: 300 },
      { id: "request", name: "即席リクエスト", price: 500 },
    ],
  }),
];

addDepartment({
  id: "goods",
  name: "グッズ",
  note: "追加部門の例",
  requiresTable: false,
  menu: [
    { id: "keyring", name: "キーホルダー", price: 250 },
    { id: "badge", name: "缶バッジ", price: 200 },
    { id: "bookmark", name: "しおり", price: 100 },
  ],
});

// 金券の種類はここで固定。店員は会計ごとに「受け取った枚数」だけ入力します。
const tickets = [
  { id: "ticket500", label: "500円券", value: 500 },
  { id: "ticket100", label: "100円券", value: 100 },
];

const page = document.body.dataset.page;
const authRequired = document.body.dataset.auth !== "none";
const hqPassword = "honbu2026";

const state = {
  departmentId: "cafe",
  quantities: {},
  ticketCounts: {},
  orders: [],
  hqUnlocked: false,
  user: null,
};

const yen = new Intl.NumberFormat("ja-JP", {
  style: "currency",
  currency: "JPY",
  maximumFractionDigits: 0,
});

function $(selector) {
  return document.querySelector(selector);
}

function initAuthGate({ onSignedIn, onSignedOut }) {
  const authPanel = $("#authPanel");
  const authForm = $("#authForm");
  const authEmail = $("#authEmail");
  const authPassword = $("#authPassword");
  const authMessage = $("#authMessage");
  const logoutButton = $("#logoutButton");
  const authSubmitButton = authForm.querySelector("button[type='submit']");

  authForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    authMessage.textContent = "";
    authSubmitButton.disabled = true;
    authSubmitButton.textContent = "ログイン中";
    try {
      await signInWithEmailAndPassword(auth, authEmail.value.trim(), authPassword.value);
    } catch (error) {
      console.error(error);
      authMessage.textContent = getAuthErrorMessage(error);
      authMessage.className = "status-text warn";
    } finally {
      authSubmitButton.disabled = false;
      authSubmitButton.textContent = "ログイン";
    }
  });

  logoutButton.addEventListener("click", async () => {
    await signOut(auth);
  });

  onAuthStateChanged(auth, (user) => {
    state.user = user;
    authPanel.classList.toggle("hidden", Boolean(user));
    logoutButton.classList.toggle("hidden", !user);
    if (user) {
      authPassword.value = "";
      onSignedIn(user);
    } else {
      onSignedOut();
    }
  });
}

function getAuthErrorMessage(error) {
  switch (error.code) {
    case "auth/invalid-email":
      return "メールアドレスの形式が正しくありません";
    case "auth/user-not-found":
    case "auth/invalid-credential":
      return "メールアドレスかパスワードが違います";
    case "auth/wrong-password":
      return "パスワードが違います";
    case "auth/operation-not-allowed":
      return "Firebaseでメール/パスワード認証が有効になっていません";
    case "auth/network-request-failed":
      return "通信に失敗しました。ネット接続を確認してください";
    default:
      return `ログインに失敗しました: ${error.code || "unknown"}`;
  }
}

function createDepartment({ id, name, note = "", requiresTable = false, menu }) {
  if (!id || !name) {
    throw new Error("部門にはidとnameが必要です");
  }
  if (!Array.isArray(menu) || menu.length === 0) {
    throw new Error(`${name}には1つ以上のメニューが必要です`);
  }

  return {
    id,
    name,
    note,
    requiresTable: Boolean(requiresTable),
    menu: menu.map(createMenuItem),
  };
}

function createMenuItem({ id, name, price }) {
  const numberPrice = Number(price);
  if (!id || !name || !Number.isFinite(numberPrice) || numberPrice < 0) {
    throw new Error("メニューにはid、name、0円以上のpriceが必要です");
  }
  return { id, name, price: numberPrice };
}

// 部門を増やす時は、この関数を使って下のように追加します。
// addDepartment({ id: "bazaar", name: "バザー", note: "本部入力", requiresTable: false, menu: [{ id: "item", name: "商品", price: 100 }] });
function addDepartment(departmentConfig) {
  const department = createDepartment(departmentConfig);
  if (departments.some((current) => current.id === department.id)) {
    throw new Error(`部門ID「${department.id}」が重複しています`);
  }
  departments.push(department);
  return department;
}

function currentDepartment() {
  return departments.find((department) => department.id === state.departmentId);
}

function clampQuantity(value) {
  const number = Number.parseInt(value, 10);
  if (Number.isNaN(number)) return 0;
  return Math.min(10, Math.max(0, number));
}

function getQuantity(itemId) {
  return state.quantities[itemId] || 0;
}

function getTicketCount(ticketId) {
  return state.ticketCounts[ticketId] || 0;
}

function selectedItems() {
  return currentDepartment()
    .menu.map((item) => ({ ...item, quantity: getQuantity(item.id) }))
    .filter((item) => item.quantity > 0);
}

function getTotals() {
  const department = currentDepartment();
  const itemTotal = department.menu.reduce((sum, item) => sum + item.price * getQuantity(item.id), 0);
  const ticketTotal = tickets.reduce((sum, ticket) => sum + ticket.value * getTicketCount(ticket.id), 0);
  return {
    itemTotal,
    ticketTotal,
    balance: ticketTotal - itemTotal,
  };
}

function showToast(message) {
  const toast = $("#toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  window.setTimeout(() => {
    toast.classList.remove("show");
  }, 2600);
}

// Realtime Databaseは { 自動ID: 注文データ } の形で返るので、画面用の配列へ直します。
function snapshotToOrders(snapshot) {
  const data = snapshot.val() || {};
  return Object.entries(data)
    .map(([firebaseId, order]) => ({ firebaseId, ...order }))
    .sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
}

function initStaffPage() {
  const els = {
    staffApp: $("#staffApp"),
    departmentList: $("#departmentList"),
    selectedDepartmentName: $("#selectedDepartmentName"),
    tableField: $("#tableField"),
    tableNumber: $("#tableNumber"),
    menuList: $("#menuList"),
    ticketInputs: $("#ticketInputs"),
    itemTotal: $("#itemTotal"),
    ticketTotal: $("#ticketTotal"),
    balanceTotal: $("#balanceTotal"),
    paymentStatus: $("#paymentStatus"),
    resetOrderButton: $("#resetOrderButton"),
    openConfirmButton: $("#openConfirmButton"),
    confirmDialog: $("#confirmDialog"),
    confirmDetails: $("#confirmDetails"),
    sendOrderButton: $("#sendOrderButton"),
  };

  function renderDepartments() {
    els.departmentList.innerHTML = departments
      .map(
        (department) => `
          <button class="department-button ${department.id === state.departmentId ? "active" : ""}" type="button" data-department="${department.id}">
            ${department.name}
            <span>${department.note}</span>
          </button>
        `,
      )
      .join("");
  }

  function renderMenu() {
    const department = currentDepartment();
    els.selectedDepartmentName.textContent = department.name;
    els.tableField.classList.toggle("hidden", !department.requiresTable);
    els.menuList.innerHTML = department.menu
      .map(
        (item) => `
          <article class="menu-item">
            <div>
              <p class="menu-name">${item.name}</p>
              <p class="menu-price">${yen.format(item.price)}</p>
            </div>
            <div class="qty-control" aria-label="${item.name}の数量操作">
              <button class="qty-button" type="button" data-action="minus" data-item="${item.id}" aria-label="${item.name}を減らす">−</button>
              <input class="qty-input" type="number" inputmode="numeric" min="0" max="10" value="${getQuantity(item.id)}" data-item="${item.id}" aria-label="${item.name}の数量" />
              <button class="qty-button" type="button" data-action="plus" data-item="${item.id}" aria-label="${item.name}を増やす">＋</button>
            </div>
          </article>
        `,
      )
      .join("");
  }

  function renderTickets() {
    els.ticketInputs.innerHTML = tickets
      .map(
        (ticket) => `
          <label class="ticket-input">
            <span>${ticket.label}</span>
            <input type="number" inputmode="numeric" min="0" value="${getTicketCount(ticket.id)}" data-ticket="${ticket.id}" aria-label="${ticket.label}の枚数" />
          </label>
        `,
      )
      .join("");
  }

  function renderTotals() {
    const totals = getTotals();
    const hasItems = selectedItems().length > 0;
    els.itemTotal.textContent = yen.format(totals.itemTotal);
    els.ticketTotal.textContent = yen.format(totals.ticketTotal);
    els.balanceTotal.textContent = `${totals.balance >= 0 ? "+" : ""}${yen.format(totals.balance)}`;
    els.openConfirmButton.disabled = !hasItems;

    els.paymentStatus.className = "status-text";
    if (!hasItems) {
      els.paymentStatus.textContent = "商品を選択してください";
    } else if (totals.balance === 0) {
      els.paymentStatus.textContent = "金額が一致しています";
      els.paymentStatus.classList.add("ok");
    } else if (totals.balance > 0) {
      els.paymentStatus.textContent = "金券が商品合計を上回っています";
      els.paymentStatus.classList.add("warn");
    } else {
      els.paymentStatus.textContent = "金券が不足しています";
      els.paymentStatus.classList.add("warn");
    }
  }

  function renderStaff() {
    renderDepartments();
    renderMenu();
    renderTickets();
    renderTotals();
  }

  function resetOrder() {
    state.quantities = {};
    state.ticketCounts = {};
    els.tableNumber.value = "";
    renderStaff();
  }

  function buildOrder() {
    const department = currentDepartment();
    const totals = getTotals();
    return {
      localId: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      createdAt: new Date().toISOString(),
      createdAtMs: Date.now(),
      createdBy: state.user ? state.user.email : "",
      createdByUid: state.user ? state.user.uid : "",
      departmentId: department.id,
      departmentName: department.name,
      tableNumber: department.requiresTable ? els.tableNumber.value.trim() : "",
      items: selectedItems(),
      tickets: tickets.map((ticket) => ({
        ...ticket,
        count: getTicketCount(ticket.id),
      })),
      itemTotal: totals.itemTotal,
      ticketTotal: totals.ticketTotal,
      balance: totals.balance,
    };
  }

  function openConfirm() {
    const order = buildOrder();
    const itemRows = order.items
      .map(
        (item) =>
          `<div class="summary-row"><span>${item.name} × ${item.quantity}</span><strong>${yen.format(item.price * item.quantity)}</strong></div>`,
      )
      .join("");
    const ticketRows = order.tickets
      .filter((ticket) => ticket.count > 0)
      .map(
        (ticket) =>
          `<div class="summary-row"><span>${ticket.label} × ${ticket.count}枚</span><strong>${yen.format(ticket.value * ticket.count)}</strong></div>`,
      )
      .join("");

    els.confirmDetails.innerHTML = `
      <div class="summary-row"><span>部門</span><strong>${order.departmentName}</strong></div>
      ${order.tableNumber ? `<div class="summary-row"><span>卓番号</span><strong>${order.tableNumber}</strong></div>` : ""}
      ${itemRows}
      ${ticketRows || `<div class="summary-row"><span>金券</span><strong>未入力</strong></div>`}
      <div class="summary-row"><span>商品合計</span><strong>${yen.format(order.itemTotal)}</strong></div>
      <div class="summary-row"><span>金券合計</span><strong>${yen.format(order.ticketTotal)}</strong></div>
    `;
    els.confirmDialog.showModal();
  }

  async function sendOrder() {
    const order = buildOrder();
    els.sendOrderButton.disabled = true;
    els.sendOrderButton.textContent = "送信中";
    try {
      // pushはRealtime Database側で注文ごとの一意なIDを作って保存します。
      await push(ordersRef, order);
      els.confirmDialog.close();
      resetOrder();
      showToast("送信しました");
    } catch (error) {
      console.error(error);
      showToast("送信に失敗しました");
    } finally {
      els.sendOrderButton.disabled = false;
      els.sendOrderButton.textContent = "送信";
    }
  }

  els.departmentList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-department]");
    if (!button) return;
    state.departmentId = button.dataset.department;
    state.quantities = {};
    els.tableNumber.value = "";
    renderStaff();
  });

  els.menuList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const itemId = button.dataset.item;
    const delta = button.dataset.action === "plus" ? 1 : -1;
    state.quantities[itemId] = clampQuantity(getQuantity(itemId) + delta);
    renderStaff();
  });

  els.menuList.addEventListener("input", (event) => {
    if (!event.target.matches(".qty-input")) return;
    state.quantities[event.target.dataset.item] = clampQuantity(event.target.value);
    event.target.value = state.quantities[event.target.dataset.item];
    renderTotals();
  });

  els.ticketInputs.addEventListener("input", (event) => {
    if (!event.target.matches("[data-ticket]")) return;
    const value = Number.parseInt(event.target.value, 10);
    state.ticketCounts[event.target.dataset.ticket] = Number.isNaN(value) ? 0 : Math.max(0, value);
    event.target.value = state.ticketCounts[event.target.dataset.ticket];
    renderTotals();
  });

  els.resetOrderButton.addEventListener("click", resetOrder);
  els.openConfirmButton.addEventListener("click", openConfirm);
  els.sendOrderButton.addEventListener("click", sendOrder);

  if (authRequired) {
    initAuthGate({
      onSignedIn() {
        els.staffApp.classList.remove("hidden");
        renderStaff();
      },
      onSignedOut() {
        els.staffApp.classList.add("hidden");
        resetOrder();
      },
    });
  } else {
    els.staffApp.classList.remove("hidden");
    renderStaff();
  }
}

function initHqPage() {
  const els = {
    hqLogin: $("#hqLogin"),
    hqLoginForm: $("#hqLoginForm"),
    hqPassword: $("#hqPassword"),
    loginMessage: $("#loginMessage"),
    dashboard: $("#dashboard"),
    metricSales: $("#metricSales"),
    metricOrders: $("#metricOrders"),
    metricTickets: $("#metricTickets"),
    departmentSummary: $("#departmentSummary"),
    ticketSummary: $("#ticketSummary"),
    historyList: $("#historyList"),
    historyCount: $("#historyCount"),
    clearHistoryButton: $("#clearHistoryButton"),
  };
  let unsubscribeOrders = null;

  function renderDashboard() {
    const sales = state.orders.reduce((sum, order) => sum + order.itemTotal, 0);
    const ticketTotal = state.orders.reduce((sum, order) => sum + order.ticketTotal, 0);
    els.metricSales.textContent = yen.format(sales);
    els.metricOrders.textContent = String(state.orders.length);
    els.metricTickets.textContent = yen.format(ticketTotal);
    els.historyCount.textContent = `${state.orders.length}件`;

    els.departmentSummary.innerHTML = departments
      .map((department) => {
        const total = state.orders
          .filter((order) => order.departmentId === department.id)
          .reduce((sum, order) => sum + order.itemTotal, 0);
        return `<div class="summary-row"><span>${department.name}</span><strong>${yen.format(total)}</strong></div>`;
      })
      .join("");

    els.ticketSummary.innerHTML = tickets
      .map((ticket) => {
        const count = state.orders.reduce((sum, order) => {
          const row = order.tickets.find((item) => item.id === ticket.id);
          return sum + (row ? row.count : 0);
        }, 0);
        return `<div class="summary-row"><span>${ticket.label}</span><strong>${count}枚 / ${yen.format(count * ticket.value)}</strong></div>`;
      })
      .join("");

    els.historyList.innerHTML =
      state.orders
        .map((order) => {
          const time = new Date(order.createdAt).toLocaleString("ja-JP", {
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          });
          const items = order.items.map((item) => `${item.name}×${item.quantity}`).join("、");
          const table = order.tableNumber ? ` / 卓${order.tableNumber}` : "";
          return `
            <article class="history-item">
              <strong>${time} ${order.departmentName}${table} ${yen.format(order.itemTotal)}</strong>
              <p>${items}</p>
              <p>金券 ${yen.format(order.ticketTotal)} / 差額 ${order.balance >= 0 ? "+" : ""}${yen.format(order.balance)}</p>
            </article>
          `;
        })
        .join("") || `<p class="status-text">注文履歴はまだありません</p>`;
  }

  els.hqLoginForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (els.hqPassword.value === hqPassword) {
      state.hqUnlocked = true;
      els.hqLogin.classList.add("hidden");
      els.dashboard.classList.remove("hidden");
      els.loginMessage.textContent = "";
      renderDashboard();
      // onValueはordersが変わるたびに呼ばれるので、本部画面がリアルタイム更新されます。
      unsubscribeOrders = onValue(ordersRef, (snapshot) => {
        state.orders = snapshotToOrders(snapshot);
        renderDashboard();
      });
    } else {
      els.loginMessage.textContent = "パスワードが違います";
      els.loginMessage.className = "status-text warn";
    }
  });

  els.clearHistoryButton.addEventListener("click", async () => {
    if (!state.hqUnlocked || state.orders.length === 0) return;
    const ok = window.confirm("注文履歴をすべて削除しますか？");
    if (!ok) return;
    try {
      await remove(ordersRef);
    } catch (error) {
      console.error(error);
      els.loginMessage.textContent = "履歴クリアに失敗しました";
      els.loginMessage.className = "status-text warn";
    }
  });

  if (authRequired) {
    initAuthGate({
      onSignedIn() {
        els.hqLogin.classList.remove("hidden");
      },
      onSignedOut() {
        if (unsubscribeOrders) {
          unsubscribeOrders();
          unsubscribeOrders = null;
        }
        state.hqUnlocked = false;
        state.orders = [];
        els.hqPassword.value = "";
        els.hqLogin.classList.add("hidden");
        els.dashboard.classList.add("hidden");
        renderDashboard();
      },
    });
  } else {
    els.hqLogin.classList.remove("hidden");
  }
}

if (page === "staff") {
  initStaffPage();
}

if (page === "hq") {
  initHqPage();
}
