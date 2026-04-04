# 🔷 XMRLens - Monero TXPool

XMRLens is a real-time Monero (XMR) txpool and blockchain explorer, heavily inspired by the aesthetics and functionality of [mempool.space](https://mempool.space) for Bitcoin. It provides a visual, intuitive interface for monitoring the Monero transaction pool, recent blocks, and network health.

![XMRLens Dashboard Preview](docs/images/preview.png)


## ✨ Features

- **Projected TXPool Blocks**: Visualises the pending transaction pool as virtual "blocks" based on fee priority and Monero's dynamic block weight limits.
- **Real-time Updates**: Powered by WebSockets for instant notification of new transactions and blocks.
- **Recent Block History**: Detailed list of recently mined blocks with size, weight, and reward data.
- **Transaction & Block Details**: Deep dive into individual transaction hashes and block heights/hashes.
- **Network Statistics**: Monitor global network hashrate, difficulty, circulating emission, and node synchronization status.
- **Fee Estimation**: Provides recommended fee levels (Slow, Normal, Fast) based on current pool congestion.
- **P2Pool Detection**: Automatically identifies blocks mined via the P2Pool decentralized mining pool.
- **Multi-Currency Support**: View XMR prices and values in USD, EUR, BTC, and more.
- **Custom Themes**: Choose between Monero (Dark), Dusk, and Light modes.

## 🚀 Getting Started

### Prerequisites

- **Node.js**: v18 or later
- **Monero Daemon (`monerod`)**: Access to a Monero node with RPC enabled. Restricted RPC is supported, but some administrative stats may require full access.

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/dy0x/xmr-mempool.git
   cd xmr-mempool
   ```

2. **Configure Environment**:
   The backend expects certain environment variables to connect to your Monero node. You can set these in your shell or modify the `start.sh` script.

   - `MONERO_HOST`: Hostname of your monerod (default: `localhost`)
   - `MONERO_RPC_PORT`: RPC port (default: `18081`)
   - `MONERO_RPC_USER`: RPC username (if enabled)
   - `MONERO_RPC_PASS`: RPC password (if enabled)
   - `PORT`: Backend server port (default: `3001`)

### Running with the Start Script

The easiest way to run XMRLens locally is using the provided `start.sh` script, which handles dependency installation and starts both the backend and frontend.

```bash
chmod +x start.sh
./start.sh
```

Alternatively, you can run the components manually:

#### Backend
```bash
cd backend
npm install
npm run dev
```

#### Frontend
```bash
cd frontend
npm install
npm run dev
```

The application will be available at `http://localhost:4200`.

## 🛠️ Architecture

- **Frontend**: Built with **React**, **TypeScript**, and **Vite**. Uses **React Router** for navigation and **WebSockets** for live data.
- **Backend**: **Node.js** with **Express** and **ws**. Acts as a proxy/aggregator for the Monero RPC, polling the daemon and broadcasting updates to clients.
- **Monero RPC**: Communicates with `monerod` via JSON-RPC to fetch pool transactions, block headers, and network info.

## 🤝 Contributing

Contributions are welcome! Whether it's fixing bugs, adding new features (like more miner pool detection), or improving UI/UX:

1. Fork the project.
2. Create your feature branch (`git checkout -b feature/AmazingFeature`).
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`).
4. Push to the branch (`git push origin feature/AmazingFeature`).
5. Open a Pull Request.

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.

---

*XMRLens is a community project and is not affiliated with the official Monero Project.*
