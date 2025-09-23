/* =========================================================
   ADMIN (Supabase-only) – wersja uproszczona, bez duplikatów
   ========================================================= */
(function () {
  'use strict';

  // --- Pomocnicze krótkie funkcje UI (1x, bez duplikatów) ---
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const money = (n) => (Number(n) || 0).toFixed(2);
  const dtPL  = (iso) => {
    const d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleString('pl-PL', { dateStyle: 'medium', timeStyle: 'short' });
  };

  // --- Supabase klient z admin.html ---
  if (!window.sb) {
    console.error('BŁĄD: Supabase nie jest zainicjalizowane (window.sb)');
    return; // nie idziemy dalej
  }
  const sb = window.sb;

  /* ============================
     Funkcje DB (async / await)
     ============================ */

  // Usługi
  async function dbLoadServices() {
    const { data, error } = await sb
      .from('services')
      .select('id, name, price, duration_min, active')
      .order('name', { ascending: true });
    if (error) { console.error('DB services:', error); return []; }
    return data || [];
  }

  // Sloty (wolne terminy)
  async function dbLoadSlots() {
    const { data, error } = await sb
      .from('slots')
      .select('id, when, taken')
      .order('when', { ascending: true });
    if (error) { console.error('DB slots:', error); return []; }
    return data || [];
  }

  async function dbAddSlot(iso) {
    const { data, error } = await sb
      .from('slots')
      .insert({ when: iso, taken: false })
      .select('id')         // chcemy znać id nowego slotu
      .single();
    if (error) { throw error; }
    return data?.id;
  }

  async function dbDeleteSlot(id) {
    const { error } = await sb.from('slots').delete().eq('id', id);
    if (error) { throw error; }
  }

  /* ======================
     Render list w panelu
     ====================== */

  // Lista “Wolne Terminy”
  async function renderSlots() {
    const list = $('#slotsList');
    if (!list) return;

    list.innerHTML = '<div class="notice">Ładowanie…</div>';

    const slots = await dbLoadSlots();
    const free  = slots.filter(s => !s.taken);

    if (!free.length) {
      list.innerHTML = '<div class="notice">Brak dodanych terminów.</div>';
      return;
    }

    list.innerHTML = '';
    free.forEach(s => {
      const row = document.createElement('div');
      row.className = 'listItem inline';
      row.style.justifyContent = 'space-between';
      row.innerHTML = `
        <div><b>${dtPL(s.when)}</b></div>
        <div class="inline">
          <button class="btn danger" data-id="${s.id}">Usuń</button>
        </div>
      `;
      list.appendChild(row);
    });

    // delegacja kliknięć "Usuń"
    list.onclick = async (e) => {
      const btn = e.target.closest('button[data-id]');
      if (!btn) return;
      if (!confirm('Usunąć ten termin?')) return;
      try {
        await dbDeleteSlot(btn.dataset.id);
        await renderSlots();
      } catch (err) {
        alert('Błąd usuwania'); console.error(err);
      }
    };
  }

  // Tabela “Usługi & Cennik”
  async function renderServices() {
    const tbody = $('#servicesBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="4">Ładowanie…</td></tr>';

    const services = await dbLoadServices();
    if (!services.length) {
      tbody.innerHTML = '<tr><td colspan="4">Brak usług.</td></tr>';
      return;
    }

    tbody.innerHTML = '';
    services.forEach(s => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${s.name}</td>
        <td>${s.duration_min} min</td>
        <td>${money(s.price)} zł</td>
        <td class="inline">
          <!-- Tu w razie potrzeby dodamy przyciski edycji/usuń -->
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  /* ===========================
     Handlery akcji w formularzu
     =========================== */

  // Dodawanie nowego slotu
  async function onAddSlot(e) {
    e.preventDefault?.();

    const d = $('#slotDate')?.value.trim();
    const t = $('#slotTime')?.value.trim();
    if (!d || !t) { alert('Wybierz datę i godzinę'); return; }

    const iso = new Date(`${d}T${t}:00`).toISOString();
    try {
      await dbAddSlot(iso);
      // wyczyść pola
      $('#slotDate').value = '';
      $('#slotTime').value = '';
      // odśwież listę
      await renderSlots();
    } catch (err) {
      alert('Nie udało się dodać'); console.error(err);
    }
  }

  /* ==========
     Init
     ========== */
  document.addEventListener('DOMContentLoaded', () => {
    console.log('ADMIN START');

    // min dla pola Data (dzisiaj)
    const min = new Date().toISOString().slice(0, 10);
    const dateInput = $('#slotDate');
    if (dateInput) dateInput.setAttribute('min', min);

    // przycisk “Dodaj termin”
    const addBtn = $('#addSlot');
    if (addBtn) {
      addBtn.setAttribute('type', 'button');  // żeby nie wysyłał formularza
      addBtn.addEventListener('click', onAddSlot);
    }

    // pierwszy render
    renderSlots();
    renderServices();
    // (jeśli masz inne sekcje jak “Rezerwacje/Klienci”, można dodać później)
  });
})();
