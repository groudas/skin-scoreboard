import axios from 'axios';

axios.get('https://steamcommunity.com/market/listings/570/Hides%20of%20Hostility%20-%20Off-Hand')
  .then(response => {
    const html = response.data;
    const body = document.body;
    const div = document.createElement('div');
    div.innerHTML = html;
    const element = div.querySelector('//*[boolean(text())]')[0];
    console.log(element);
  });
