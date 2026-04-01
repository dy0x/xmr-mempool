import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';

/* TODO: Rotating Address */
const DONATE_ADDRESS =
  '83cNrgPXED6Zm563GT2eVLPtBvPxZ7YH579EJeqE2NCVPfdXBqnceqNj21ndRiepTaYjfnoMBitzkgf3n8NVabop68C9LrU';

export default function About() {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(DONATE_ADDRESS).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="about-page">

      {/* Header */}
      <div className="about-header">
        <div className="about-xmr-icon">ɱ</div>
        <h1 className="about-title">
          <span style={{ color: '#ff6600' }}>XMR</span>mempool.space
        </h1>
        <p className="about-tagline">A real-time Monero mempool &amp; blockchain explorer</p>
      </div>

      {/* Description */}
      <div className="about-card">
        <h2 className="about-section-title">What is this?</h2>
        <p className="about-body">
          XMRmempool.space is an open-source, self-hosted blockchain explorer for the Monero network —
          inspired by <a href="https://mempool.space" target="_blank" rel="noopener noreferrer">mempool.space</a>.
          It connects directly to a local Monero full node and shows live mempool activity,
          pending transaction blocks, fee estimates, network hashrate, and recent confirmed blocks.
        </p>
        <p className="about-body" style={{ marginTop: '10px' }}>
          Monero is a privacy-focused cryptocurrency where transaction amounts, senders, and
          recipients are all cryptographically hidden. Unlike Bitcoin, there are no addresses or
          amounts visible on-chain. This explorer reflects that by showing what
          <em> is</em> public: block structure, fees, timing, and mempool pressure.
        </p>
      </div>

      {/* Donate */}
      <div className="about-card about-donate-card">
        <h2 className="about-section-title">☕ Support the project</h2>
        <p className="about-body">
          If you find this useful, feel free to send a tip in XMR. Every piconero appreciated.
        </p>

        <div className="about-donate-inner">
          <div className="about-qr-wrap">
            <QRCodeSVG
              value={DONATE_ADDRESS}
              size={180}
              bgColor="transparent"
              fgColor="#ffffff"
              level="M"
            />
          </div>

          {/* Address + copy */}
          <div className="about-address-block">
            <div className="about-address-label">Monero address</div>
            <div className="about-address-text">{DONATE_ADDRESS}</div>
            <button
              className={`about-copy-btn ${copied ? 'about-copy-btn-ok' : ''}`}
              onClick={handleCopy}
            >
              {copied ? '✓ Copied!' : 'Copy address'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
