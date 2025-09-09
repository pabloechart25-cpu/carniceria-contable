// Keys (versioned to avoid old localStorage conflicts)
const PRODUCTS_KEY = 'carniceria_products_v1';
const SALES_KEY = 'carniceria_sales_v1';

// Try to load from localStorage safely
function loadJSON(key, fallback){
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch(e){ return fallback; }
}

let products = loadJSON(PRODUCTS_KEY, [
  { id: genId(), name: "Carne Molida", priceKg: 25.00, stockKg: 40.000 },
  { id: genId(), name: "Bife", priceKg: 60.00, stockKg: 20.000 }
]);
let sales = loadJSON(SALES_KEY, []);

// Save helper
function save(){
  localStorage.setItem(PRODUCTS_KEY, JSON.stringify(products));
  localStorage.setItem(SALES_KEY, JSON.stringify(sales));
}

// Formatting
function formatMoney(n){ return `Bs. ${Number(n).toFixed(2)}`; }
function formatKg(n){ return `${Number(n).toFixed(3)} kg`; }

// DOM refs
const productListEl = document.getElementById('productList');
const saleSelectEl = document.getElementById('saleProduct');
const salesListEl = document.getElementById('salesList');
const totalSalesEl = document.getElementById('totalSales');
const notifEl = document.getElementById('notif');
const btnRegister = document.getElementById('btnRegister');
const btnAdd = document.getElementById('btnAdd');
const btnDaily = document.getElementById('btnDaily');
const btnMonthly = document.getElementById('btnMonthly');
const btnClearStorage = document.getElementById('btnClearStorage');

// Render products & select
function renderProducts(){
  // product list
  productListEl.innerHTML = '';
  products.forEach(p => {
    const row = document.createElement('div');
    row.innerHTML = `
      <div>
        <strong>${escapeHtml(p.name)}</strong>
        &nbsp;-&nbsp; ${formatMoney(p.priceKg)}/kg
        &nbsp;|&nbsp; Stock: ${formatKg(p.stockKg)}
      </div>
      <div class="actions">
        <button onclick="editProduct('${p.id}')">✏️</button>
        <button onclick="deleteProduct('${p.id}')">❌</button>
      </div>
    `;
    productListEl.appendChild(row);
  });

  // select
  saleSelectEl.innerHTML = '';
  if (products.length === 0){
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = '--- No hay cortes en inventario ---';
    saleSelectEl.appendChild(opt);
    btnRegister.disabled = true;
  } else {
    products.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = `${p.name} (${formatMoney(p.priceKg)}/kg) — Stock ${formatKg(p.stockKg)}`;
      saleSelectEl.appendChild(opt);
    });
    btnRegister.disabled = false;
  }

  renderSales();
}

// Add product (validated)
function addProduct(){
  const name = (document.getElementById('newName').value || '').trim();
  const priceRaw = document.getElementById('newPrice').value;
  const stockRaw = document.getElementById('newStock').value;

  if (name === '' || priceRaw === '' || stockRaw === '') return notify('Completa todos los datos');

  const price = parseFloat(priceRaw);
  const stock = parseFloat(stockRaw);

  if (!isFinite(price) || price <= 0) return notify('Precio inválido (> 0)');
  if (!isFinite(stock) || stock < 0) return notify('Stock inválido (>= 0)');

  products.unshift({
    id: genId(),
    name,
    priceKg: Number(price.toFixed(2)),
    stockKg: Number(stock.toFixed(3))
  });

  save();
  renderProducts();

  // clear inputs
  document.getElementById('newName').value = '';
  document.getElementById('newPrice').value = '';
  document.getElementById('newStock').value = '';

  notify('Producto añadido correctamente');
}

// Edit product
function editProduct(id){
  const p = products.find(x => x.id === id);
  if (!p) return notify('Producto no encontrado');

  const newName = prompt('Nuevo nombre:', p.name);
  if (newName === null) return; // cancel

  const newPriceRaw = prompt('Nuevo precio por kg (Bs):', p.priceKg);
  if (newPriceRaw === null) return;
  const newStockRaw = prompt('Nuevo stock (kg):', p.stockKg);
  if (newStockRaw === null) return;

  const newPrice = parseFloat(newPriceRaw);
  const newStock = parseFloat(newStockRaw);

  if (!isFinite(newPrice) || newPrice <= 0) return notify('Precio inválido');
  if (!isFinite(newStock) || newStock < 0) return notify('Stock inválido');

  p.name = newName.trim();
  p.priceKg = Number(newPrice.toFixed(2));
  p.stockKg = Number(newStock.toFixed(3));

  save();
  renderProducts();
  notify('Producto actualizado');
}

// Delete product
function deleteProduct(id){
  if (!confirm('¿Eliminar este producto?')) return;
  products = products.filter(p => p.id !== id);
  save();
  renderProducts();
  notify('Producto eliminado');
}

// Register sale (select + monto)
function registerSale(){
  const id = saleSelectEl.value;
  const moneyRaw = document.getElementById('saleMoney').value;

  if (!id) return notify('Seleccione un corte');
  if (moneyRaw === '') return notify('Ingrese monto (Bs.)');

  const money = parseFloat(moneyRaw);
  if (!isFinite(money) || money <= 0) return notify('Monto inválido (> 0)');

  const p = products.find(x => x.id === id);
  if (!p) return notify('Producto no encontrado');

  const kgRaw = money / p.priceKg;
  const kg = Math.round(kgRaw * 1000) / 1000; // 3 decimals (gramos)

  if (kg <= 0) return notify('Monto demasiado pequeño para calcular kilos');
  if (p.stockKg + 1e-9 < kg) return notify('Stock insuficiente');

  // update stock
  p.stockKg = Number((p.stockKg - kg).toFixed(3));

  // create sale record with ISO date for filtering
  const sale = {
    id: genId(),
    productId: p.id,
    name: p.name,
    kg,
    unitBsPerKg: p.priceKg,
    totalBs: Number(money.toFixed(2)),
    dateISO: new Date().toISOString()
  };

  sales.unshift(sale);
  save();
  renderProducts();

  // clear money input
  document.getElementById('saleMoney').value = '';

  notify(`Venta registrada: ${p.name} — ${formatKg(kg)} • ${formatMoney(sale.totalBs)}`);
}

// Render sales & totals
function renderSales(){
  salesListEl.innerHTML = '';
  const slice = sales.slice(0, 30);
  slice.forEach(s => {
    const d = new Date(s.dateISO);
    const display = `${s.name} — ${formatKg(s.kg)} • ${formatMoney(s.totalBs)} (${d.toLocaleString()})`;
    const el = document.createElement('div');
    el.textContent = display;
    salesListEl.appendChild(el);
  });
  const total = sales.reduce((a,b)=>a + Number(b.totalBs || 0), 0);
  totalSalesEl.textContent = formatMoney(total);
}

// PDF generation (using dateISO)
function generatePdf(title, from, to){
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const rows = [];

  const filtered = sales.filter(s => {
    const d = new Date(s.dateISO);
    return d >= from && d <= to;
  });

  filtered.forEach(s => {
    rows.push([s.name, formatKg(s.kg), formatMoney(s.unitBsPerKg), formatMoney(s.totalBs), new Date(s.dateISO).toLocaleString()]);
  });

  const total = filtered.reduce((a,s)=>a + Number(s.totalBs || 0), 0);

  doc.setFontSize(12);
  doc.text(title, 14, 18);
  doc.setFontSize(9);
  doc.text(`Generado: ${new Date().toLocaleString()}`, 14, 26);
  doc.autoTable({
    head: [['Producto','Kg','Bs/kg','Total (Bs)','Fecha']],
    body: rows,
    startY: 36,
    styles: { fontSize: 9 }
  });

  // Add inventory snapshot at end
  doc.setFontSize(10);
  doc.text('Inventario actual (kg):', 14, doc.lastAutoTable.finalY + 14);
  const invRows = products.map(p => [p.name, formatKg(p.stockKg), formatMoney(p.priceKg)]);
  doc.autoTable({
    head: [['Producto','Stock (kg)','Bs/kg']],
    body: invRows,
    startY: doc.lastAutoTable.finalY + 20,
    styles: { fontSize: 9 }
  });

  doc.text(`Total ventas: ${formatMoney(total)}`, 14, doc.lastAutoTable.finalY + 18);
  const filename = `${title.replace(/\s+/g,'_')}_${(new Date()).toISOString().slice(0,10)}.pdf`;
  doc.save(filename);
  notify('PDF generado');
}

function generateDailyPDF(){
  const start = new Date(); start.setHours(0,0,0,0);
  const end = new Date(); end.setHours(23,59,59,999);
  generatePdf(`Reporte Diario ${(new Date()).toISOString().slice(0,10)}`, start, end);
}
function generateMonthlyPDF(){
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1, 0,0,0,0);
  const end = new Date(now.getFullYear(), now.getMonth()+1, 0, 23,59,59,999);
  generatePdf(`Reporte Mensual ${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`, start, end);
}

// Notification helper
let notifTimer = null;
function notify(msg){
  notifEl.textContent = msg;
  notifEl.classList.remove('hidden');
  if (notifTimer) clearTimeout(notifTimer);
  notifTimer = setTimeout(()=> notifEl.classList.add('hidden'), 2800);
}

// Utility: escape text for safe insertion
function escapeHtml(s){
  return String(s).replace(/[&<>"'`]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;', "'":'&#39;','`':'&#96;'})[c]);
}

// Clear data (for testing)
function clearData(){
  if (!confirm('Borrar todos los datos locales (productos + ventas)?')) return;
  localStorage.removeItem(PRODUCTS_KEY);
  localStorage.removeItem(SALES_KEY);
  products = [];
  sales = [];
  renderProducts();
  notify('Datos borrados');
}

// ID helper
function genId(){ return Math.random().toString(36).substr(2,9); }

// Event bindings
btnRegister.addEventListener('click', registerSale);
btnAdd.addEventListener('click', addProduct);
btnDaily.addEventListener('click', generateDailyPDF);
btnMonthly.addEventListener('click', generateMonthlyPDF);
btnClearStorage.addEventListener('click', clearData);

// Initial render
renderProducts();
