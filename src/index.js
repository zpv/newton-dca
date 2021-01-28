require('dotenv').config();

const crypto = require('crypto');
const Axios = require('axios');
const io = require('socket.io-client');

const axios = new Axios.create({ baseURL: 'https://api.newton.co/v1' });

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const ORDER_SIZE = parseFloat(process.env.ORDER_SIZE);
const FREQUENCY = parseInt(process.env.FREQUENCY);

const NewtonGET = async (path, query = {}) => {
  const currentTime = Math.round(new Date().getTime() / 1000);

  const signatureParameters = ['GET', '', `/v1/${path}`, '', currentTime];

  const signatureData = signatureParameters.join(':');

  const computedSignature = crypto
    .createHmac('sha256', CLIENT_SECRET)
    .update(signatureData)
    .digest('base64');

  const NewtonAPIAuth = `${CLIENT_ID}:${computedSignature}`;
  const NewtonDate = currentTime;

  return (
    await axios.get(`/${path}`, {
      params: query,
      headers: {
        NewtonAPIAuth,
        NewtonDate,
      },
    })
  ).data;
};

const nextBuy = () =>
  new Date(new Date().getTime() + 60 * 1000 * 60 * FREQUENCY);

let NEXT_BUY = new Date();

const NewtonBUY = async (path, quantity, price) => {
  const currentTime = Math.round(new Date().getTime() / 1000);
  const stringifiedBody = `{"order_type": "LIMIT", "time_in_force": "GTD", "side": "BUY", "symbol": "BTC_USDC", "quantity": ${quantity}, "price": ${price}, "expiry_time": "${new Date(
    new Date().getTime() + 60 * 1000 * 60
  ).toISOString()}"}`;
  const hashed_body = crypto
    .createHash('sha256')
    .update(stringifiedBody)
    .digest('hex');

  const signatureParameters = [
    'POST',
    'application/json',
    `/v1/${path}`,
    hashed_body,
    currentTime,
  ];

  const signatureData = signatureParameters.join(':');

  const computedSignature = crypto
    .createHmac('sha256', CLIENT_SECRET)
    .update(signatureData)
    .digest('base64');

  const NewtonAPIAuth = `${CLIENT_ID}:${computedSignature}`;
  const NewtonDate = currentTime;

  return axios.post(`/${path}`, stringifiedBody, {
    headers: {
      'Content-Type': 'application/json',
      NewtonAPIAuth,
      NewtonDate,
    },
  });
};

(async () => {
  console.log((await NewtonGET('order/history'))[0]);

  const socket = io.connect(
    `https://ws.newton.co/v1/live-pricing?symbol=BTC_USDC`,
    {
      transports: ['websocket'],
      reconnection: true,
    }
  );

  socket.emit('subscribe');
  socket.on('connecting', () => {
    console.log('connecting');
  });
  socket.on('connect_error', (err) => {
    console.log('connect', err);
  });

  socket.on('initial', async (data) => {
    console.log(data);
  });

  socket.on('update', async (data) => {
    if (!(+NEXT_BUY < +new Date())) return;

    const { ask } = data;
    console.log(`[DCA] Buying at $${ask}`);

    try {
      NEXT_BUY = nextBuy();
      await NewtonBUY(
        'order/new',
        (ORDER_SIZE / ask).toFixed(4),
        ask.toFixed(2)
      );
    } catch (e) {
      console.log(e);
    }
  });
})();
