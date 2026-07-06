// Firebaseの設定とインポートはすべて削除しました！

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

const tickets = [
  { id: "ticket500", label: "500円券", value: 500 },
  { id: "ticket100", label: "100円券", value: 100 },
];

const page = document.body.dataset.page;
const hqPassword = "honbu2026";

const state = {
  departmentId: "cafe",
  quantities: {},
  ticketCounts: {},
  orders: [],
  hqUnlocked: false,
};

const yen = new Intl.NumberFormat("ja-JP", {
  style: "currency",
  currency: "JPY",
  maximumFractionDigits: 0,
});

function $(selector) {
  return document.querySelector(selector);
}

function createDepartment({ id, name, note = "", requiresTable = false, menu }) {
  if (!id || !name) throw new Error("部門にはidとnameが必要です");
  if (!Array.isArray(menu) || menu.length === 0) throw new Error(`${name}には1つ以上のメニューが必要です`);
  return {
    id, name, note, requiresTable: Boolean(requiresTable),
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

function addDepartment(departmentConfig) {
  const department = createDepartment(departmentConfig);
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

function getQuantity(itemId) { return state.quantities[itemId] || 0; }
function getTicketCount(ticketId) { return state.ticketCounts[ticketId] || 0; }

function selectedItems() {
  return currentDepartment()
    .menu.map((item) => ({ ...item, quantity: getQuantity(item.id) }))
    .filter((item) => item.quantity > 0);
}

function getTotals() {
  const department = currentDepartment();
  const itemTotal = department.menu.reduce((sum, item) => sum + item.price * getQuantity(item.id), 0);
  const ticketTotal = tickets.reduce((sum, ticket) => sum + ticket.value * getTicketCount(ticket.id), 0);
  return { itemTotal, ticketTotal, balance: ticketTotal - itemTotal };
}

function showToast(message) {
  const toast = $("#toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  window.setTimeout(() => toast.classList.remove("show"), 2600);
}

// === スタッフ（店員用）の処理 ===
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

  // 認証の仕組みを無くしたため、強制的に画面を表示します
  els.staffApp.classList.remove("hidden");
  document.getElementById("authPanel")?.classList.add("hidden");

  function renderStaff() {
    els.departmentList.innerHTML = departments.map((department) => `
      <button class="department-button ${department.id === state.departmentId ? "active" : ""}" type="button" data-department="${department.id}">
        ${department.name}<span>${department.note}</span>
      </button>`).join("");

    const department = currentDepartment();
    els.selectedDepartmentName.textContent = department.name;
    els.tableField.classList.toggle("hidden", !department.requiresTable);
    
    els.menuList.innerHTML = department.menu.map((item) => `
      <article class="menu-item">
        <div><p class="menu-name">${item.name}</p><p class="menu-price">${yen.format(item.price)}</p></div>
        <div class="qty-control">
          <button class="qty-button" type="button" data-action="minus" data-item="${item.id}">−</button>
          <input class="qty-input" type="number" min="0" max="10" value="${getQuantity(item.id)}" data-item="${item.id}" />
          <button class="qty-button" type="button" data-action="plus" data-item="${item.id}">＋</button>
        </div>
      </article>`).join("");

    els.ticketInputs.innerHTML = tickets.map((ticket) => `
      <label class="ticket-input">
        <span>${ticket.label}</span>
        <input type="number" min="0" value="${getTicketCount(ticket.id)}" data-ticket="${ticket.id}" />
      </label>`).join("");

    const totals = getTotals();
    const hasItems = selectedItems().length > 0;
    els.itemTotal.textContent = yen.format(totals.itemTotal);
    els.ticketTotal.textContent = yen.format(totals.ticketTotal);
    els.balanceTotal.textContent = `${totals.balance >= 0 ? "+" : ""}${yen.format(totals.balance)}`;
    els.openConfirmButton.disabled = !hasItems;

    els.paymentStatus.className = "status-text";
    if (!hasItems) els.paymentStatus.textContent = "商品を選択してください";
    else if (totals.balance === 0) { els.paymentStatus.textContent = "金額が一致しています"; els.paymentStatus.classList.add("ok"); }
    else if (totals.balance > 0) { els.paymentStatus.textContent = "金券が商品合計を上回っています"; els.paymentStatus.classList.add("warn"); }
    else { els.paymentStatus.textContent = "金券が不足しています"; els.paymentStatus.classList.add("warn"); }
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
      departmentId: department.id,
      departmentName: department.name,
      tableNumber: department.requiresTable ? els.tableNumber.value.trim() : "",
      items: selectedItems(),
      tickets: tickets.map((ticket) => ({ ...ticket, count: getTicketCount(ticket.id) })),
      itemTotal: totals.itemTotal,
      ticketTotal: totals.ticketTotal,
      balance: totals.balance,
    };
  }

  function openConfirm() {
    const order = buildOrder();
    const itemRows = order.items.map((item) => `<div class="summary-row"><span>${item.name} × ${item.quantity}</span><strong>${yen.format(item.price * item.quantity)}</strong></div>`).join("");
    const ticketRows = order.tickets.filter((ticket) => ticket.count > 0).map((ticket) => `<div class="summary-row"><span>${ticket.label} × ${ticket.count}枚</span><strong>${yen.format(ticket.value * ticket.count)}</strong></div>`).join("");

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

  // ★変更点：Firebaseではなく自作サーバー（Node.js）のAPIにデータを送る
  async function sendOrder() {
    const order = buildOrder();
    els.sendOrderButton.disabled = true;
    els.sendOrderButton.textContent = "送信中";
    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(order)
      });
      if (!response.ok) throw new Error("Network response was not ok");
      
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

  els.departmentList.addEventListener("click", (e) => {
    const button = e.target.closest("[data-department]");
    if (!button) return;
    state.departmentId = button.dataset.department;
    state.quantities = {};
    els.tableNumber.value = "";
    renderStaff();
  });

  els.menuList.addEventListener("click", (e) => {
    const button = e.target.closest("[data-action]");
    if (!button) return;
    const itemId = button.dataset.item;
    const delta = button.dataset.action === "plus" ? 1 : -1;
    state.quantities[itemId] = clampQuantity(getQuantity(itemId) + delta);
    renderStaff();
  });

  els.menuList.addEventListener("input", (e) => {
    if (!e.target.matches(".qty-input")) return;
    state.quantities[e.target.dataset.item] = clampQuantity(e.target.value);
    e.target.value = state.quantities[e.target.dataset.item];
    renderStaff();
  });

  els.ticketInputs.addEventListener("input", (e) => {
    if (!e.target.matches("[data-ticket]")) return;
    const value = Number.parseInt(e.target.value, 10);
    state.ticketCounts[e.target.dataset.ticket] = Number.isNaN(value) ? 0 : Math.max(0, value);
    e.target.value = state.ticketCounts[e.target.dataset.ticket];
    renderStaff();
  });

  els.resetOrderButton.addEventListener("click", resetOrder);
  els.openConfirmButton.addEventListener("click", openConfirm);
  els.sendOrderButton.addEventListener("click", sendOrder);

  renderStaff();
}

// === 本部（集計用）の処理 ===
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

  els.hqLogin.classList.remove("hidden");
  document.getElementById("authPanel")?.classList.add("hidden");

  function renderDashboard() {
    const sales = state.orders.reduce((sum, order) => sum + order.itemTotal, 0);
    const ticketTotal = state.orders.reduce((sum, order) => sum + order.ticketTotal, 0);
    els.metricSales.textContent = yen.format(sales);
    els.metricOrders.textContent = String(state.orders.length);
    els.metricTickets.textContent = yen.format(ticketTotal);
    els.historyCount.textContent = `${state.orders.length}件`;

    els.departmentSummary.innerHTML = departments.map((department) => {
        const total = state.orders
          .filter((order) => order.departmentId === department.id)
          .reduce((sum, order) => sum + order.itemTotal, 0);
        return `<div class="summary-row"><span>${department.name}</span><strong>${yen.format(total)}</strong></div>`;
    }).join("");

    // 金券集計のテーブル化
    let tktHtml = `<table style="width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 0.95em;">`;
    tktHtml += `<thead><tr style="border-bottom: 2px solid var(--line, #d9e1dc); text-align: left;">
      <th style="padding: 8px 4px;">金券種別</th>`;
    departments.forEach(dept => { tktHtml += `<th style="padding: 8px 4px;">${dept.name}</th>`; });
    tktHtml += `<th style="padding: 8px 4px;">合計</th><th style="padding: 8px 4px;">小計</th></tr></thead><tbody>`;

    tickets.forEach((ticket) => {
      const totalCount = state.orders.reduce((sum, order) => {
        const row = order.tickets.find((item) => item.id === ticket.id);
        return sum + (row ? row.count : 0);
      }, 0);
      tktHtml += `<tr style="border-bottom: 1px solid var(--line, #d9e1dc);"><td style="padding: 8px 4px;">${ticket.label}</td>`;
      departments.forEach(dept => {
        const deptCount = state.orders.filter(order => order.departmentId === dept.id).reduce((sum, order) => {
            const row = order.tickets.find((item) => item.id === ticket.id);
            return sum + (row ? row.count : 0);
          }, 0);
        tktHtml += `<td style="padding: 8px 4px;">${deptCount}枚</td>`;
      });
      tktHtml += `<td style="padding: 8px 4px; font-weight: bold;">${totalCount}枚</td><td style="padding: 8px 4px; font-weight: bold;">${yen.format(totalCount * ticket.value)}</td></tr>`;
    });
    tktHtml += `</tbody></table>`;
    els.ticketSummary.innerHTML = tktHtml;

    els.historyList.innerHTML = state.orders.map((order) => {
          const time = new Date(order.createdAt).toLocaleString("ja-JP", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
          const items = order.items.map((item) => `${item.name}×${item.quantity}`).join("、");
          const table = order.tableNumber ? ` / 卓${order.tableNumber}` : "";
          return `
            <article class="history-item">
              <strong>${time} ${order.departmentName}${table} ${yen.format(order.itemTotal)}</strong>
              <p>${items}</p>
              <p>金券 ${yen.format(order.ticketTotal)} / 差額 ${order.balance >= 0 ? "+" : ""}${yen.format(order.balance)}</p>
            </article>
          `;
        }).join("") || `<p class="status-text">注文履歴はまだありません</p>`;
  }

  // ★変更点：ローカルのサーバーからデータを取得する関数
  async function fetchOrders() {
    try {
      const response = await fetch('/api/orders');
      if (!response.ok) return;
      const data = await response.json();
      // 時間の新しい順に並び替え
      state.orders = data.sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
      renderDashboard();
    } catch (err) {
      console.error("データ取得エラー:", err);
    }
  }

  let fetchInterval;

  els.hqLoginForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (els.hqPassword.value === hqPassword) {
      state.hqUnlocked = true;
      els.hqLogin.classList.add("hidden");
      els.dashboard.classList.remove("hidden");
      els.loginMessage.textContent = "";
      
      // ログイン直後に1回取得し、以降は3秒ごとに最新データがないか取得しに行く（ポーリング）
      fetchOrders();
      fetchInterval = setInterval(fetchOrders, 3000);
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
      // サーバーに削除指令を送る
      await fetch('/api/orders', { method: 'DELETE' });
      state.orders = [];
      renderDashboard();
    } catch (error) {
      console.error(error);
      els.loginMessage.textContent = "履歴クリアに失敗しました";
      els.loginMessage.className = "status-text warn";
    }
  });
}

if (page === "staff") initStaffPage();
if (page === "hq") initHqPage();