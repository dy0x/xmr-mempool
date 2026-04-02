import MoneroRPC from './src/monero-rpc';

async function run() {
  const rpc = new MoneroRPC([{
    host: 'node.supportxmr.com',
    port: 18081
  }]);
  
  try {
    const res = await rpc.getLastBlockHeader();
    console.log(JSON.stringify(res.block_header, null, 2));
  } catch (err) {
    console.error(err);
  }
}
run();
