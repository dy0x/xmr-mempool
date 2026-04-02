const axios = require('axios');

async function run() {
  try {
    const res = await axios.post('http://node.supportxmr.com:18081/json_rpc', {
      jsonrpc: '2.0',
      id: '0',
      method: 'get_last_block_header'
    });
    console.log(JSON.stringify(res.data, null, 2));
  } catch (err) {
    console.error(err);
  }
}
run();
