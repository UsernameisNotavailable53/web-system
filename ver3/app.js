import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import {
  getDatabase,
  onValue,
  push,
  ref,
  remove,
  update,
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-database.js";

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

// 各部門が最初に持っている金券枚数。お釣り用の100円券を配る場合はここを増やします。
const initialTicketStock = {
  cafe: { ticket500: 0, ticket100: 0 },
  illust: { ticket500: 0, ticket100: 0 },
  goods: { ticket500: 0, ticket100: 0 },
};

const page = document.body.dataset.page;
const authRequired = document.body.dataset.auth !== "none";
const hqPassword = "honbu2026";

const state = {
  departmentId: "cafe",
  quantities: {},
  ticketCounts: {},
  ticketReturnCounts: {},
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

function getTicketReturnCount(ticketId) {
  return state.ticketReturnCounts[ticketId] || 0;
}

function getInitialTicketStock(departmentId, ticketId) {
  return initialTicketStock[departmentId]?.[ticketId] || 0;
}

function selectedItems() {
  return currentDepartment()
    .menu.map((item) => ({ ...item, quantity: getQuantity(item.id) }))
    .filter((item) => item.quantity > 0);
}

function getTotals() {
  const department = currentDepartment();
  const itemTotal = department.menu.reduce((sum, item) => sum + item.price * getQuantity(item.id), 0);
  const receivedTotal = tickets.reduce((sum, ticket) => sum + ticket.value * getTicketCount(ticket.id), 0);
  const returnedTotal = tickets.reduce((sum, ticket) => sum + ticket.value * getTicketReturnCount(ticket.id), 0);
  const ticketTotal = receivedTotal - returnedTotal;
  return {
    itemTotal,
    receivedTotal,
    returnedTotal,
    ticketTotal,
    balance: ticketTotal - itemTotal,
  };
}

function normalizeOrder(order) {
  const normalizedTickets = tickets.map((ticket) => {
    const saved = (order.tickets || []).find((item) => item.id === ticket.id) || {};
    const receivedCount = Number(saved.receivedCount ?? saved.count ?? 0);
    const returnedCount = Number(saved.returnedCount ?? 0);
    const safeReceived = Number.isFinite(receivedCount) ? Math.max(0, receivedCount) : 0;
    const safeReturned = Number.isFinite(returnedCount) ? Math.max(0, returnedCount) : 0;
    return {
      ...ticket,
      count: safeReceived,
      receivedCount: safeReceived,
      returnedCount: safeReturned,
      netCount: safeReceived - safeReturned,
    };
  });
  const receivedTotal = normalizedTickets.reduce((sum, ticket) => sum + ticket.value * ticket.receivedCount, 0);
  const returnedTotal = normalizedTickets.reduce((sum, ticket) => sum + ticket.value * ticket.returnedCount, 0);
  const ticketTotal = receivedTotal - returnedTotal;
  const itemTotal = Number(order.itemTotal || 0);
  return {
    ...order,
    items: order.items || [],
    tickets: normalizedTickets,
    itemTotal,
    receivedTotal,
    returnedTotal,
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
    .map(([firebaseId, order]) => normalizeOrder({ firebaseId, ...order }))
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
          <div class="ticket-input">
            <strong>${ticket.label}</strong>
            <label>
              <span>受取</span>
              <input type="number" inputmode="numeric" min="0" value="${getTicketCount(ticket.id)}" data-ticket="${ticket.id}" data-ticket-kind="received" aria-label="${ticket.label}の受取枚数" />
            </label>
            <label>
              <span>返却</span>
              <input type="number" inputmode="numeric" min="0" value="${getTicketReturnCount(ticket.id)}" data-ticket="${ticket.id}" data-ticket-kind="returned" aria-label="${ticket.label}の返却枚数" />
            </label>
          </div>
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
    state.ticketReturnCounts = {};
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
        receivedCount: getTicketCount(ticket.id),
        returnedCount: getTicketReturnCount(ticket.id),
        netCount: getTicketCount(ticket.id) - getTicketReturnCount(ticket.id),
      })),
      itemTotal: totals.itemTotal,
      receivedTotal: totals.receivedTotal,
      returnedTotal: totals.returnedTotal,
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
      .filter((ticket) => ticket.receivedCount > 0 || ticket.returnedCount > 0)
      .map(
        (ticket) =>
          `<div class="summary-row"><span>${ticket.label} 受取${ticket.receivedCount}枚 / 返却${ticket.returnedCount}枚</span><strong>${yen.format(ticket.value * ticket.netCount)}</strong></div>`,
      )
      .join("");

    els.confirmDetails.innerHTML = `
      <div class="summary-row"><span>部門</span><strong>${order.departmentName}</strong></div>
      ${order.tableNumber ? `<div class="summary-row"><span>卓番号</span><strong>${order.tableNumber}</strong></div>` : ""}
      ${itemRows}
      ${ticketRows || `<div class="summary-row"><span>金券</span><strong>未入力</strong></div>`}
      <div class="summary-row"><span>商品合計</span><strong>${yen.format(order.itemTotal)}</strong></div>
      <div class="summary-row"><span>受取合計</span><strong>${yen.format(order.receivedTotal)}</strong></div>
      <div class="summary-row"><span>返却合計</span><strong>${yen.format(order.returnedTotal)}</strong></div>
      <div class="summary-row"><span>金券差引</span><strong>${yen.format(order.ticketTotal)}</strong></div>
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
    const safeValue = Number.isNaN(value) ? 0 : Math.max(0, value);
    if (event.target.dataset.ticketKind === "returned") {
      state.ticketReturnCounts[event.target.dataset.ticket] = safeValue;
      event.target.value = state.ticketReturnCounts[event.target.dataset.ticket];
    } else {
      state.ticketCounts[event.target.dataset.ticket] = safeValue;
      event.target.value = state.ticketCounts[event.target.dataset.ticket];
    }
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
    departmentTicketSummary: $("#departmentTicketSummary"),
    historyList: $("#historyList"),
    historyCount: $("#historyCount"),
    clearHistoryButton: $("#clearHistoryButton"),
    editOrderDialog: $("#editOrderDialog"),
    editOrderFields: $("#editOrderFields"),
    saveEditOrderButton: $("#saveEditOrderButton"),
  };
  let unsubscribeOrders = null;
  let editingOrderId = null;

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
        const movementCount = state.orders.reduce((sum, order) => {
          const row = order.tickets.find((item) => item.id === ticket.id);
          return sum + (row ? row.netCount : 0);
        }, 0);
        const initialCount = departments.reduce(
          (sum, department) => sum + getInitialTicketStock(department.id, ticket.id),
          0,
        );
        const count = initialCount + movementCount;
        const received = state.orders.reduce((sum, order) => {
          const row = order.tickets.find((item) => item.id === ticket.id);
          return sum + (row ? row.receivedCount : 0);
        }, 0);
        const returned = state.orders.reduce((sum, order) => {
          const row = order.tickets.find((item) => item.id === ticket.id);
          return sum + (row ? row.returnedCount : 0);
        }, 0);
        return `<div class="summary-row"><span>${ticket.label}</span><strong>保有${count}枚 / 初期${initialCount}枚 / 受取${received}枚 / 返却${returned}枚</strong></div>`;
      })
      .join("");

    els.departmentTicketSummary.innerHTML = departments
      .map((department) => {
        const rows = tickets
          .map((ticket) => {
            const movementCount = state.orders
              .filter((order) => order.departmentId === department.id)
              .reduce((sum, order) => {
                const row = order.tickets.find((item) => item.id === ticket.id);
                return sum + (row ? row.netCount : 0);
              }, 0);
            const initialCount = getInitialTicketStock(department.id, ticket.id);
            const count = initialCount + movementCount;
            return `<div class="summary-row"><span>${ticket.label}</span><strong>${count}枚 / ${yen.format(count * ticket.value)}</strong></div>`;
          })
          .join("");
        return `
          <article class="ticket-holding-card">
            <h4>${department.name}</h4>
            ${rows}
          </article>
        `;
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
          const ticketText = order.tickets
            .filter((ticket) => ticket.receivedCount > 0 || ticket.returnedCount > 0)
            .map((ticket) => `${ticket.label}: 保有${ticket.netCount}枚`)
            .join("、");
          return `
            <article class="history-item" data-order-id="${order.firebaseId}">
              <strong>${time} ${order.departmentName}${table} ${yen.format(order.itemTotal)}</strong>
              <p>${items}</p>
              <p>金券差引 ${yen.format(order.ticketTotal)} / 差額 ${order.balance >= 0 ? "+" : ""}${yen.format(order.balance)}</p>
              <p>${ticketText || "金券なし"}</p>
              <div class="history-actions">
                <button class="ghost-button compact-button" type="button" data-action="edit-order" data-order-id="${order.firebaseId}">編集</button>
                <button class="ghost-button compact-button danger" type="button" data-action="delete-order" data-order-id="${order.firebaseId}">取消</button>
              </div>
            </article>
          `;
        })
        .join("") || `<p class="status-text">注文履歴はまだありません</p>`;
  }

  function orderToEditableState(order) {
    const department = departments.find((item) => item.id === order.departmentId) || departments[0];
    const quantities = {};
    department.menu.forEach((item) => {
      const saved = order.items.find((orderItem) => orderItem.id === item.id);
      quantities[item.id] = saved ? clampQuantity(saved.quantity) : 0;
    });
    const ticketCounts = {};
    const ticketReturnCounts = {};
    tickets.forEach((ticket) => {
      const saved = order.tickets.find((item) => item.id === ticket.id);
      ticketCounts[ticket.id] = saved ? Math.max(0, Number(saved.receivedCount || 0)) : 0;
      ticketReturnCounts[ticket.id] = saved ? Math.max(0, Number(saved.returnedCount || 0)) : 0;
    });
    return {
      departmentId: department.id,
      tableNumber: order.tableNumber || "",
      quantities,
      ticketCounts,
      ticketReturnCounts,
    };
  }

  function getEditFormState() {
    const departmentId = $("#editDepartment").value;
    const department = departments.find((item) => item.id === departmentId) || departments[0];
    const quantities = {};
    department.menu.forEach((item) => {
      const input = els.editOrderFields.querySelector(`[data-edit-item="${item.id}"]`);
      quantities[item.id] = clampQuantity(input ? input.value : 0);
    });
    const ticketCounts = {};
    const ticketReturnCounts = {};
    tickets.forEach((ticket) => {
      const received = els.editOrderFields.querySelector(`[data-edit-ticket="${ticket.id}"][data-ticket-kind="received"]`);
      const returned = els.editOrderFields.querySelector(`[data-edit-ticket="${ticket.id}"][data-ticket-kind="returned"]`);
      ticketCounts[ticket.id] = Math.max(0, Number.parseInt(received ? received.value : 0, 10) || 0);
      ticketReturnCounts[ticket.id] = Math.max(0, Number.parseInt(returned ? returned.value : 0, 10) || 0);
    });
    return {
      department,
      quantities,
      ticketCounts,
      ticketReturnCounts,
      tableNumber: $("#editTableNumber") ? $("#editTableNumber").value.trim() : "",
    };
  }

  function buildOrderFromEdit(existingOrder) {
    const formState = getEditFormState();
    const items = formState.department.menu
      .map((item) => ({
        ...item,
        quantity: formState.quantities[item.id] || 0,
      }))
      .filter((item) => item.quantity > 0);
    const itemTotal = formState.department.menu.reduce(
      (sum, item) => sum + item.price * (formState.quantities[item.id] || 0),
      0,
    );
    const orderTickets = tickets.map((ticket) => {
      const receivedCount = formState.ticketCounts[ticket.id] || 0;
      const returnedCount = formState.ticketReturnCounts[ticket.id] || 0;
      return {
        ...ticket,
        count: receivedCount,
        receivedCount,
        returnedCount,
        netCount: receivedCount - returnedCount,
      };
    });
    const receivedTotal = orderTickets.reduce((sum, ticket) => sum + ticket.value * ticket.receivedCount, 0);
    const returnedTotal = orderTickets.reduce((sum, ticket) => sum + ticket.value * ticket.returnedCount, 0);
    const ticketTotal = receivedTotal - returnedTotal;
    return {
      localId: existingOrder.localId || String(Date.now()),
      createdAt: existingOrder.createdAt,
      createdAtMs: existingOrder.createdAtMs || Date.now(),
      updatedAt: new Date().toISOString(),
      createdBy: existingOrder.createdBy || "",
      createdByUid: existingOrder.createdByUid || "",
      departmentId: formState.department.id,
      departmentName: formState.department.name,
      tableNumber: formState.department.requiresTable ? formState.tableNumber : "",
      items,
      tickets: orderTickets,
      itemTotal,
      receivedTotal,
      returnedTotal,
      ticketTotal,
      balance: ticketTotal - itemTotal,
    };
  }

  function renderEditFields(editableState) {
    const department = departments.find((item) => item.id === editableState.departmentId) || departments[0];
    const menuRows = department.menu
      .map(
        (item) => `
          <label class="edit-field">
            <span>${item.name} ${yen.format(item.price)}</span>
            <input type="number" inputmode="numeric" min="0" max="10" value="${editableState.quantities[item.id] || 0}" data-edit-item="${item.id}" />
          </label>
        `,
      )
      .join("");
    const ticketRows = tickets
      .map(
        (ticket) => `
          <div class="ticket-input">
            <strong>${ticket.label}</strong>
            <label>
              <span>受取</span>
              <input type="number" inputmode="numeric" min="0" value="${editableState.ticketCounts[ticket.id] || 0}" data-edit-ticket="${ticket.id}" data-ticket-kind="received" />
            </label>
            <label>
              <span>返却</span>
              <input type="number" inputmode="numeric" min="0" value="${editableState.ticketReturnCounts[ticket.id] || 0}" data-edit-ticket="${ticket.id}" data-ticket-kind="returned" />
            </label>
          </div>
        `,
      )
      .join("");

    els.editOrderFields.innerHTML = `
      <label class="edit-field">
        <span>部門</span>
        <select id="editDepartment">
          ${departments
            .map(
              (item) =>
                `<option value="${item.id}" ${item.id === department.id ? "selected" : ""}>${item.name}</option>`,
            )
            .join("")}
        </select>
      </label>
      <label class="edit-field ${department.requiresTable ? "" : "hidden"}" id="editTableField">
        <span>卓番号</span>
        <input id="editTableNumber" type="text" inputmode="numeric" maxlength="4" value="${editableState.tableNumber}" />
      </label>
      <section>
        <h4>商品</h4>
        <div class="edit-grid">${menuRows}</div>
      </section>
      <section>
        <h4>金券</h4>
        <div class="ticket-grid">${ticketRows}</div>
      </section>
    `;
  }

  function openEditOrder(orderId) {
    const order = state.orders.find((item) => item.firebaseId === orderId);
    if (!order) return;
    editingOrderId = orderId;
    renderEditFields(orderToEditableState(order));
    els.editOrderDialog.showModal();
  }

  async function saveEditOrder() {
    if (!editingOrderId) return;
    const order = state.orders.find((item) => item.firebaseId === editingOrderId);
    if (!order) return;
    const updatedOrder = buildOrderFromEdit(order);
    if (updatedOrder.items.length === 0) {
      window.alert("商品を1つ以上入力してください");
      return;
    }
    els.saveEditOrderButton.disabled = true;
    els.saveEditOrderButton.textContent = "保存中";
    try {
      await update(ref(database, `orders/${editingOrderId}`), updatedOrder);
      els.editOrderDialog.close();
      editingOrderId = null;
    } catch (error) {
      console.error(error);
      window.alert("注文の編集に失敗しました");
    } finally {
      els.saveEditOrderButton.disabled = false;
      els.saveEditOrderButton.textContent = "保存";
    }
  }

  async function deleteOrder(orderId) {
    const order = state.orders.find((item) => item.firebaseId === orderId);
    if (!order) return;
    const ok = window.confirm(`${order.departmentName} ${yen.format(order.itemTotal)} の注文を取り消しますか？`);
    if (!ok) return;
    try {
      await remove(ref(database, `orders/${orderId}`));
    } catch (error) {
      console.error(error);
      window.alert("注文の取り消しに失敗しました");
    }
  }

  els.historyList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const orderId = button.dataset.orderId;
    if (button.dataset.action === "edit-order") {
      openEditOrder(orderId);
    }
    if (button.dataset.action === "delete-order") {
      deleteOrder(orderId);
    }
  });

  els.editOrderFields.addEventListener("change", (event) => {
    if (event.target.id !== "editDepartment") return;
    const current = getEditFormState();
    renderEditFields({
      departmentId: current.department.id,
      tableNumber: current.tableNumber,
      quantities: current.quantities,
      ticketCounts: current.ticketCounts,
      ticketReturnCounts: current.ticketReturnCounts,
    });
  });

  els.saveEditOrderButton.addEventListener("click", saveEditOrder);

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
