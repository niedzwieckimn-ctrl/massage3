// NAZWA ZABIEGU = TEKST WYBRANEJ OPCJI (nie value/ID)
const svcEl = document.querySelector('#service');
const serviceName =
  (svcEl?.options?.[svcEl.selectedIndex]?.text || '').trim() ||
  (svcEl?.value || '').trim(); // awaryjnie

// DANE KLIENTA Z FORMULARZA
const name    = (document.querySelector('#name')    ?.value || '').trim();
const email   = (document.querySelector('#email')   ?.value || '').trim();
const phone   = (document.querySelector('#phone')   ?.value || '').trim();
const address = (document.querySelector('#address') ?.value || '').trim();
const date    = (document.querySelector('#date')    ?.value || '').trim();
const time    = (document.querySelector('#time')    ?.value || '').trim();
const notes   = (document.querySelector('#notes')   ?.value || '').trim();

// PROSTY ID REZERWACJI (jeśli już masz swój — użyj swojego)
const bookingId = crypto?.randomUUID?.() || Date.now().toString(36);

// >>> TYLKO TE DWIE ZMIENNE PODMIENIASZ <<<

// 1) TEMAT MAILA
const subject = `NOWA REZERWACJA #${bookingId} — ${serviceName} — ${date} ${time}`.trim();

// 2) TREŚĆ MAILA (KOLEJNOŚĆ JAK USTALILIŚMY)
const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.5;color:#111">
    <h3 style="margin:0 0 16px">Nowa rezerwacja</h3>
    <table style="border-collapse:collapse;width:100%;max-width:640px">
      <tbody>
        <tr><td style="padding:8px;border-bottom:1px solid #eee;width:220px"><strong>Nr rezerwacji</strong></td><td style="padding:8px;border-bottom:1px solid #eee">${bookingId}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #eee"><strong>Imię i nazwisko</strong></td><td style="padding:8px;border-bottom:1px solid #eee">${name || '-'}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #eee"><strong>Adres</strong></td><td style="padding:8px;border-bottom:1px solid #eee">${address || '-'}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #eee"><strong>Nr telefonu</strong></td><td style="padding:8px;border-bottom:1px solid #eee">${phone || '-'}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #eee"><strong>Email klienta</strong></td><td style="padding:8px;border-bottom:1px solid #eee">${email || '-'}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #eee"><strong>Nazwa zabiegu</strong></td><td style="padding:8px;border-bottom:1px solid #eee">${serviceName || '-'}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #eee"><strong>Data i godzina</strong></td><td style="padding:8px;border-bottom:1px solid #eee">${date || '-'}${time ? ' ' + time : ''}</td></tr>
        <tr><td style="padding:8px;border-bottom:1px solid #eee"><strong>Uwagi</strong></td><td style="padding:8px;border-bottom:1px solid #eee">${(notes || '-').replace(/[<>&"]/g, s => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[s]))}</td></tr>
      </tbody>
    </table>
  </div>
`;
