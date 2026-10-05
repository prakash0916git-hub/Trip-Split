
const Validators = {
  required(value){
    return value.trim().length > 0 ? '' : 'This field is required.';
  },
  minLength(value, n){
    return value.trim().length >= n ? '' : `Must be at least ${n} characters.`;
  },
  positiveNumber(value){
    const trimmed = String(value).trim();
    if(trimmed === '') return 'Enter an amount.';
    const n = parseFloat(trimmed);
    if(isNaN(n)) return 'Enter a valid number.';
    if(n <= 0) return 'Amount must be greater than 0.';
    return '';
  }
};

function setFieldError(fieldId, message){
  const errEl = document.getElementById('err-' + fieldId);
  const inputEl = document.getElementById(fieldId);
  if(errEl) errEl.textContent = message;
  if(inputEl) inputEl.classList.toggle('input-invalid', !!message);
}

function clearFieldError(fieldId){
  setFieldError(fieldId, '');
}
