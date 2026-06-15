const departments = [
  {
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
  },
  {
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
  },
  {
    id: "goods",
    name: "グッズ",
    note: "追加部門の例",
    requiresTable: false,
    menu: [
      { id: "keyring", name: "キーホルダー", price: 250 },
      { id: "badge", name: "缶バッジ", price: 200 },
      { id: "bookmark", name: "しおり", price: 100 },
    ],
  },
];

const tickets = [
  { id: "ticket500", label: "500円券", value: 500 },
  { id: "ticket100", label: "100円券", value: 100 },
];

const state = {
  route: "staff",
  departmentId: "cafe",
  quantities: {},
  ticketCounts: {},
  orders: loadOrders(),
  hqUnlocked: false,
};

const yen = new Intl.NumberFormat("ja-JP", {
  style: "currency",
  currency: "JPY",
  maximumFractionDigits: 0,
});

const els = {
  navButtons: document.querySelectorAll(".nav-button"),
  staffView: document.querySelector("#staffView"),
  hqView: document.querySelector("#hqView"),
  departmentList: document.querySelector("#departmentList"),
  selectedDepartmentName: document.querySelector("#selectedDepartmentName"),
  tableField: document.querySelector("#tableField"),
  tableNumber: document.querySelector("#tableNumber"),
  menuList: document.querySelector("#menuList"),
  ticketInputs: document.querySelector("#ticketInputs"),
  itemTotal: document.querySelector("#itemTotal"),
  ticketTotal: document.querySelector("#ticketTotal"),
  balanceTotal: document.querySelector("#balanceTotal"),
  paymentStatus: document.querySelector("#paymentStatus"),
  resetOrderButton: document.querySelector("#resetOrderButton"),
  openConfirmButton: document.querySelector("#openConfirmButton"),
  confirmDialog: document.querySelector("#confirmDialog"),
  confirmDetails: document.querySelector("#confirmDetails"),
  sendOrderButton: document.querySelector("#sendOrderButton"),
  hqLogin: document.querySelector("#hqLogin"),
  hqLoginForm: document.querySelector("#hqLoginForm"),
  hqPassword: document.querySelector("#hqPassword"),
  loginMessage: document.querySelector("#loginMessage"),
  dashboard: document.querySelector("#dashboard"),
  metricSales: document.querySelector("#metricSales"),
  metricOrders: document.querySelector("#metricOrders"),
  metricTickets: document.querySelector("#metricTickets"),
  departmentSummary: document.querySelector("#departmentSummary"),
  ticketSummary: document.querySelector("#ticketSummary"),
  historyList: document.querySelector("#historyList"),
  historyCount: document.querySelector("#historyCount"),
  clearHistoryButton: document.querySelector("#clearHistoryButton"),
};

function currentDepartment() {
  return departments.find((department) => department.id === state.departmentId);
}

function loadOrders() {
  try {
    return JSON.parse(localStorage.getItem("festivalOrders") || "[]");
  } catch {
    return [];
  }
}

function saveOrders() {
  localStorage.setItem("festivalOrders", JSON.stringify(state.orders));
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

function getTotals() {
  const department = currentDepartment();
  const itemTotal = department.menu.reduce((sum, item) => {
    return sum + item.price * getQuantity(item.id);
  }, 0);
  const ticketTotal = tickets.reduce((sum, ticket) => {
    return sum + ticket.value * getTicketCount(ticket.id);
  }, 0);
  return {
    itemTotal,
    ticketTotal,
    balance: ticketTotal - itemTotal,
  };
}

function selectedItems() {
  return currentDepartment()
    .menu.map((item) => ({ ...item, quantity: getQuantity(item.id) }))
    .filter((item) => item.quantity > 0);
}

function renderRoute() {
  els.navButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.route === state.route);
  });
  els.staffView.classList.toggle("active", state.route === "staff");
  els.hqView.classList.toggle("active", state.route === "hq");
  if (state.route === "hq") renderDashboard();
}

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
          <div class="qty-control" aria-label="${item.name}の数量">
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
          <input type="number" inputmode="numeric" min="0" value="${getTicketCount(ticket.id)}" data-ticket="${ticket.id}" />
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
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    createdAt: new Date().toISOString(),
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
    .map((item) => `<div class="summary-row"><span>${item.name} × ${item.quantity}</span><strong>${yen.format(item.price * item.quantity)}</strong></div>`)
    .join("");
  const ticketRows = order.tickets
    .filter((ticket) => ticket.count > 0)
    .map((ticket) => `<div class="summary-row"><span>${ticket.label} × ${ticket.count}</span><strong>${yen.format(ticket.value * ticket.count)}</strong></div>`)
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

function sendOrder() {
  const order = buildOrder();
  state.orders.unshift(order);
  saveOrders();
  els.confirmDialog.close();
  resetOrder();
  renderDashboard();
}

function renderDashboard() {
  if (!state.hqUnlocked) return;
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

els.navButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.route = button.dataset.route;
    renderRoute();
  });
});

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

els.hqLoginForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (els.hqPassword.value === "honbu2026") {
    state.hqUnlocked = true;
    els.hqLogin.classList.add("hidden");
    els.dashboard.classList.remove("hidden");
    els.loginMessage.textContent = "";
    renderDashboard();
  } else {
    els.loginMessage.textContent = "パスワードが違います";
    els.loginMessage.className = "status-text warn";
  }
});

els.clearHistoryButton.addEventListener("click", () => {
  if (!state.hqUnlocked || state.orders.length === 0) return;
  const ok = window.confirm("注文履歴をすべて削除しますか？");
  if (!ok) return;
  state.orders = [];
  saveOrders();
  renderDashboard();
});

renderStaff();
renderRoute();
