(function(global){
  function ymd(d){const x=new Date(d);return [x.getFullYear(),String(x.getMonth()+1).padStart(2,'0'),String(x.getDate()).padStart(2,'0')].join('-');}
  function fmtDate(d){return new Date(d).toLocaleDateString();}
  function fmtMoney(n){return new Intl.NumberFormat('pl-PL',{style:'currency',currency:'PLN'}).format(n);}
  function makeBookingNo(){return 'B'+Date.now().toString(36).toUpperCase();}
  global.Helpers={ymd,fmtDate,fmtMoney,makeBookingNo};
})(window);
