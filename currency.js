
const CurrencyService = {
  cache: {}, // base currency code -> { timestamp, rates }

  async fetchRates(base){
    const FIVE_MIN = 5 * 60 * 1000;
    const cached = this.cache[base];
    if(cached && (Date.now() - cached.timestamp) < FIVE_MIN){
      return cached.rates;
    }

    const url = 'https://open.er-api.com/v6/latest/' + encodeURIComponent(base);
    const res = await fetch(url);

    if(!res.ok){
      throw new Error('Exchange rate service returned status ' + res.status);
    }

    const data = await res.json();

    if(data.result !== 'success'){
      throw new Error('Exchange rate service reported an error.');
    }

    this.cache[base] = { timestamp: Date.now(), rates: data.rates };
    return data.rates;
  }
};
