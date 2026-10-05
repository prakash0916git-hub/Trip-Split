
const ModalSystem = (function(){

  function open(id){
    const el = document.getElementById(id);
    if(!el) return;
    el.classList.add('open');
    document.body.classList.add('modal-open');

    const focusable = el.querySelector('input, select, textarea, button');
    if(focusable) setTimeout(() => focusable.focus(), 60);
  }

  function close(id){
    const el = document.getElementById(id);
    if(!el) return;
    el.classList.remove('open');

    const anyStillOpen = document.querySelector('.modal-overlay.open, .drawer-overlay.open');
    if(!anyStillOpen) document.body.classList.remove('modal-open');
  }

  function closeAll(){
    document.querySelectorAll('.modal-overlay.open, .drawer-overlay.open').forEach(el => el.classList.remove('open'));
    document.body.classList.remove('modal-open');
  }

  // Click handling: close triggers + backdrop clicks
  document.addEventListener('click', (e) => {
    const closeModalTarget = e.target.closest('[data-close-modal]');
    if(closeModalTarget){ close(closeModalTarget.getAttribute('data-close-modal')); return; }

    const closeDrawerTarget = e.target.closest('[data-close-drawer]');
    if(closeDrawerTarget){ close(closeDrawerTarget.getAttribute('data-close-drawer')); return; }

    // Clicking directly on the overlay (not its children) closes it.
    if(e.target.classList.contains('modal-overlay') || e.target.classList.contains('drawer-overlay')){
      close(e.target.id);
    }
  });

  // Escape key closes whatever is open
  document.addEventListener('keydown', (e) => {
    if(e.key === 'Escape') closeAll();
  });

  return { open, close, closeAll };
})();
