
const Toast = (function(){
  let container = null;

  function getContainer(){
    if(!container) container = document.getElementById('toastContainer');
    return container;
  }

  function show(message, type = 'info', duration = 4000){
    const el = getContainer();
    if(!el) return null;

    const icons = { success: '✓', error: '!', info: 'i' };

    const toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    toast.innerHTML =
      '<span class="toast-icon">' + (icons[type] || 'i') + '</span>' +
      '<span class="toast-message"></span>' +
      '<button class="toast-close" aria-label="Dismiss">×</button>' +
      '<div class="toast-progress"></div>';

    toast.querySelector('.toast-message').textContent = message;
    el.appendChild(toast);

    let dismissTimer = null;

    function remove(){
      if(dismissTimer) clearTimeout(dismissTimer);
      toast.classList.remove('toast-enter');
      toast.classList.add('toast-exit');
      setTimeout(() => toast.remove(), 220);
    }

    toast.querySelector('.toast-close').addEventListener('click', remove);

    // Force a reflow so the enter transition actually plays.
    requestAnimationFrame(() => toast.classList.add('toast-enter'));

    if(duration > 0){
      const bar = toast.querySelector('.toast-progress');
      bar.style.animationDuration = duration + 'ms';
      dismissTimer = setTimeout(remove, duration);
      toast.addEventListener('mouseenter', () => clearTimeout(dismissTimer));
      toast.addEventListener('mouseleave', () => { dismissTimer = setTimeout(remove, 1200); });
    }

    return toast;
  }

  return { show };
})();
