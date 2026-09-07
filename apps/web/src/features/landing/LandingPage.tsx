import { useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Invoice01Icon,
  AiBrain01Icon,
  BankIcon,
  Camera01Icon,
  Analytics01Icon,
  ShieldCheck,
  BarChartIcon,
  ArrowRight01Icon,
  CheckmarkCircle02Icon,
  SparklesIcon,
  Building01Icon,
} from '@hugeicons/core-free-icons';
import { ThemeToggle } from '../../lib/ui';

interface LandingPageProps {
  onGoToAuth: () => void;
}

export function LandingPage({ onGoToAuth }: LandingPageProps) {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'copilot' | 'gst' | 'ocr'>('dashboard');

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: 'var(--bg)',
        color: 'var(--text)',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
        overflowX: 'hidden',
        position: 'relative',
      }}
    >
      {/* ── Top Navbar ──────────────────────────────────────────────────────── */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          backgroundColor: 'rgba(var(--bg), 0.82)',
          borderBottom: '1px solid var(--border)',
          transition: 'border-color 0.2s ease',
        }}
      >
        <div
          style={{
            maxWidth: '1200px',
            margin: '0 auto',
            padding: '0.85rem 1.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          {/* Logo */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              cursor: 'pointer',
              userSelect: 'none',
            }}
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          >
            <span
              style={{
                fontSize: '1.45rem',
                fontFamily: "'Space Grotesk', sans-serif",
                fontWeight: 600,
                letterSpacing: '-0.03em',
                color: 'var(--text)',
                display: 'inline-flex',
                alignItems: 'center',
              }}
            >
              Fin
              <span
                style={{
                  fontFamily: "'Google Sans', sans-serif",
                  fontWeight: 700,
                  color: 'var(--accent)',
                  marginLeft: '2px',
                }}
              >
                Pilot
              </span>
            </span>
            <span
              style={{
                fontSize: '0.65rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                padding: '2px 7px',
                borderRadius: '999px',
                backgroundColor: 'var(--accent-soft)',
                color: 'var(--accent)',
                border: '1px solid rgba(255, 68, 4, 0.25)',
              }}
            >
              AI
            </span>
          </div>

          {/* Navigation links */}
          <nav
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '1.75rem',
            }}
            className="landing-nav-links"
          >
            <a href="#features" className="landing-link">Features</a>
            <a href="#preview" className="landing-link">Product Tour</a>
            <a href="#how-it-works" className="landing-link">How It Works</a>
            <a href="#architecture" className="landing-link">Architecture</a>
          </nav>

          {/* Right Action: Theme toggle + Sign In */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem' }}>
            <ThemeToggle />
            <button
              onClick={onGoToAuth}
              className="landing-signin-btn"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                backgroundColor: 'var(--accent)',
                color: '#ffffff',
                border: 'none',
                padding: '0.55rem 1.15rem',
                borderRadius: '8px',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                boxShadow: '0 2px 8px var(--accent-glow)',
              }}
            >
              <span>Sign In</span>
              <HugeiconsIcon icon={ArrowRight01Icon} size={15} />
            </button>
          </div>
        </div>
      </header>

      {/* ── Hero Section ────────────────────────────────────────────────────── */}
      <section
        style={{
          position: 'relative',
          padding: '4.5rem 1.5rem 3.5rem 1.5rem',
          maxWidth: '1200px',
          margin: '0 auto',
          textAlign: 'center',
        }}
      >
        {/* Background ambient glow effect */}
        <div
          style={{
            position: 'absolute',
            top: '10%',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '640px',
            height: '320px',
            background: 'radial-gradient(circle, var(--accent-glow) 0%, transparent 70%)',
            filter: 'blur(50px)',
            pointerEvents: 'none',
            zIndex: 0,
          }}
        />

        <div style={{ position: 'relative', zIndex: 1 }}>
          {/* Badge */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 14px',
              borderRadius: '999px',
              backgroundColor: 'var(--panel-2)',
              border: '1px solid var(--border)',
              fontSize: '0.78rem',
              fontWeight: 600,
              color: 'var(--muted)',
              marginBottom: '1.75rem',
              animation: 'fp-fade-up 0.5s ease both',
            }}
          >
            <HugeiconsIcon icon={SparklesIcon} size={15} color="var(--accent)" />
            <span>Automated Accounting for Indian SMEs • GST IMS 2.0 Ready</span>
          </div>

          {/* Main Title */}
          <h1
            style={{
              fontFamily: "'Space Grotesk', -apple-system, sans-serif",
              fontSize: 'clamp(2.4rem, 5.5vw, 4.2rem)',
              fontWeight: 700,
              lineHeight: 1.12,
              letterSpacing: '-0.04em',
              maxWidth: '920px',
              margin: '0 auto 1.5rem auto',
              color: 'var(--text)',
            }}
          >
            Books on Autopilot.{' '}
            <span
              style={{
                background: 'linear-gradient(135deg, var(--accent) 0%, #ff7744 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              Math You Can Bet On.
            </span>
          </h1>

          {/* Subtitle */}
          <p
            style={{
              fontSize: 'clamp(1rem, 1.8vw, 1.22rem)',
              lineHeight: 1.6,
              color: 'var(--muted)',
              maxWidth: '720px',
              margin: '0 auto 2.5rem auto',
              fontWeight: 400,
            }}
          >
            Double-entry ledger precision paired with an AI Copilot that{' '}
            <strong style={{ color: 'var(--text)', fontWeight: 600 }}>
              narrates what the engine computes — never hallucinating numbers
            </strong>
            . Automate GST IMS reconciliation, scan bills with OCR, and forecast cash runway in seconds.
          </p>

          {/* Hero CTAs */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '1rem',
              flexWrap: 'wrap',
              marginBottom: '3rem',
            }}
          >
            <button
              onClick={onGoToAuth}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                backgroundColor: 'var(--accent)',
                color: '#ffffff',
                border: 'none',
                padding: '0.85rem 1.8rem',
                borderRadius: '10px',
                fontSize: '1rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                boxShadow: '0 4px 18px var(--accent-glow)',
              }}
              className="hero-primary-btn"
            >
              <span>Get Started / Sign In</span>
              <HugeiconsIcon icon={ArrowRight01Icon} size={18} />
            </button>

            <a
              href="#preview"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                backgroundColor: 'var(--panel)',
                color: 'var(--text)',
                border: '1px solid var(--border)',
                padding: '0.85rem 1.6rem',
                borderRadius: '10px',
                fontSize: '1rem',
                fontWeight: 500,
                textDecoration: 'none',
                transition: 'all 0.2s ease',
              }}
              className="hero-secondary-btn"
            >
              <span>Live Feature Tour</span>
              <HugeiconsIcon icon={Analytics01Icon} size={17} color="var(--muted)" />
            </a>
          </div>

          {/* Quick Pillars Chips */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '1.5rem',
              flexWrap: 'wrap',
              fontSize: '0.85rem',
              color: 'var(--muted)',
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <HugeiconsIcon icon={CheckmarkCircle02Icon} size={16} color="var(--green)" />
              Schedule III Indian Chart
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <HugeiconsIcon icon={CheckmarkCircle02Icon} size={16} color="var(--green)" />
              Append-Only Reversible Entries
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <HugeiconsIcon icon={CheckmarkCircle02Icon} size={16} color="var(--green)" />
              Zero AI Math Hallucinations
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <HugeiconsIcon icon={CheckmarkCircle02Icon} size={16} color="var(--green)" />
              1-Click GST IMS Reconciliation
            </span>
          </div>
        </div>
      </section>

      {/* ── Interactive Product Showcase / Mockup ───────────────────────────── */}
      <section
        id="preview"
        style={{
          maxWidth: '1120px',
          margin: '0 auto 5rem auto',
          padding: '0 1.5rem',
        }}
      >
        <div
          style={{
            backgroundColor: 'var(--panel)',
            border: '1px solid var(--border)',
            borderRadius: '16px',
            overflow: 'hidden',
            boxShadow: 'var(--shadow-lift)',
            transition: 'border-color 0.25s ease',
          }}
        >
          {/* Mockup Window Header */}
          <div
            style={{
              padding: '0.85rem 1.25rem',
              backgroundColor: 'var(--panel-2)',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#ef4444' }} />
              <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#f59e0b' }} />
              <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#10b981' }} />
              <span style={{ marginLeft: 12, fontSize: '0.78rem', color: 'var(--muted)', fontWeight: 500 }}>
                app.finpilot.ai — Acme Enterprises Private Limited (FY 2026-27)
              </span>
            </div>

            {/* Interactive Tab Switcher */}
            <div style={{ display: 'flex', gap: '4px' }}>
              {(
                [
                  { id: 'dashboard', label: 'Dashboard & Forecast', icon: Analytics01Icon },
                  { id: 'copilot', label: 'AI Copilot', icon: AiBrain01Icon },
                  { id: 'gst', label: 'GST IMS Portal', icon: ShieldCheck },
                  { id: 'ocr', label: 'Bill OCR', icon: Camera01Icon },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '5px 12px',
                    borderRadius: '6px',
                    border: 'none',
                    fontSize: '0.76rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    backgroundColor: activeTab === tab.id ? 'var(--accent)' : 'transparent',
                    color: activeTab === tab.id ? '#ffffff' : 'var(--muted)',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <HugeiconsIcon icon={tab.icon} size={14} />
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Mockup Body Content */}
          <div style={{ padding: '1.75rem' }}>
            {activeTab === 'dashboard' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
                {/* Metric 1: Cash in Hand */}
                <div
                  style={{
                    backgroundColor: 'var(--panel-2)',
                    border: '1px solid var(--border)',
                    borderRadius: '12px',
                    padding: '1.25rem',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--muted)', fontWeight: 500 }}>Operating Cash</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--green)', fontWeight: 600 }}>+14.2% MoM</span>
                  </div>
                  <div style={{ fontSize: '1.8rem', fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace" }}>
                    ₹24,80,450
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: '0.35rem' }}>
                    Across 3 HDFC & ICICI current accounts
                  </div>
                </div>

                {/* Metric 2: Monte Carlo Forecast */}
                <div
                  style={{
                    backgroundColor: 'var(--panel-2)',
                    border: '1px solid var(--border)',
                    borderRadius: '12px',
                    padding: '1.25rem',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--muted)', fontWeight: 500 }}>13-Week Cash Forecast</span>
                    <span style={{ fontSize: '0.72rem', backgroundColor: 'var(--accent-soft)', color: 'var(--accent)', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>
                      Monte Carlo P50
                    </span>
                  </div>
                  <div style={{ fontSize: '1.8rem', fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace", color: 'var(--accent)' }}>
                    ₹31,15,000
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: '0.35rem' }}>
                    Runway: 98 days (90% confidence &gt; ₹19.4L)
                  </div>
                </div>

                {/* Metric 3: GST IMS Status */}
                <div
                  style={{
                    backgroundColor: 'var(--panel-2)',
                    border: '1px solid var(--border)',
                    borderRadius: '12px',
                    padding: '1.25rem',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--muted)', fontWeight: 500 }}>IMS ITC Actions</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--amber)', fontWeight: 600 }}>Due 14th</span>
                  </div>
                  <div style={{ fontSize: '1.8rem', fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace" }}>
                    42 / 42 Matched
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--green)', marginTop: '0.35rem' }}>
                    ✓ Zero deemed-acceptance surprises
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'copilot' && (
              <div
                style={{
                  backgroundColor: 'var(--panel-2)',
                  border: '1px solid var(--border)',
                  borderRadius: '12px',
                  padding: '1.5rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1.25rem' }}>
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: '8px',
                      backgroundColor: 'var(--accent)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#ffffff',
                    }}
                  >
                    <HugeiconsIcon icon={AiBrain01Icon} size={18} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>FinPilot Grounded Copilot</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>
                      Read tools: 24 active • Grounding validator: Strict (I9)
                    </div>
                  </div>
                </div>

                {/* Question bubble */}
                <div
                  style={{
                    alignSelf: 'flex-end',
                    backgroundColor: 'var(--panel)',
                    border: '1px solid var(--border)',
                    borderRadius: '10px',
                    padding: '0.85rem 1.15rem',
                    maxWidth: '560px',
                    marginBottom: '1rem',
                    fontSize: '0.88rem',
                  }}
                >
                  <span style={{ color: 'var(--muted)', fontSize: '0.75rem', display: 'block', marginBottom: '3px' }}>
                    Accountant Query
                  </span>
                  "How much cash will we have on the 15th after paying our three largest overdue vendor bills?"
                </div>

                {/* Copilot response bubble */}
                <div
                  style={{
                    backgroundColor: 'var(--panel)',
                    border: '1px solid rgba(255, 68, 4, 0.3)',
                    borderRadius: '10px',
                    padding: '1rem 1.25rem',
                    fontSize: '0.88rem',
                    lineHeight: 1.55,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '0.5rem', color: 'var(--accent)', fontWeight: 600, fontSize: '0.78rem' }}>
                    <HugeiconsIcon icon={SparklesIcon} size={14} />
                    <span>Engine-Validated Answer (0 Math Hallucinations)</span>
                  </div>
                  <p style={{ margin: '0 0 0.5rem 0' }}>
                    Based on your verified ledger and current bank balances (
                    <strong style={{ fontFamily: "'IBM Plex Mono', monospace" }}>₹24,80,450</strong>):
                  </p>
                  <ul style={{ margin: '0 0 0.75rem 1.25rem', padding: 0 }}>
                    <li>Paying top 3 bills (Apex Logistics ₹1,42,000, Cloudways ₹84,500, Star Pack ₹52,100) totals <strong>₹2,78,600</strong>.</li>
                    <li>Expected AR customer collections by the 14th: <strong>₹3,40,000</strong>.</li>
                  </ul>
                  <div style={{ padding: '0.5rem 0.75rem', backgroundColor: 'var(--panel-2)', borderRadius: '6px', fontWeight: 600, display: 'inline-block' }}>
                    Projected Cash Balance on 15th: <span style={{ color: 'var(--accent)', fontFamily: "'IBM Plex Mono', monospace" }}>₹25,41,850</span>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'gst' && (
              <div
                style={{
                  backgroundColor: 'var(--panel-2)',
                  border: '1px solid var(--border)',
                  borderRadius: '12px',
                  padding: '1.25rem',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <div>
                    <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600 }}>GSTR-2B vs. Books Reconciliation (IMS)</h4>
                    <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Tax Period: March 2026 • Cutoff: 14th midnight</span>
                  </div>
                  <span style={{ padding: '4px 10px', borderRadius: '6px', backgroundColor: 'rgba(16, 185, 129, 0.1)', color: 'var(--green)', fontSize: '0.78rem', fontWeight: 600 }}>
                    100% Tax Credit Claimable
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {[
                    { supplier: 'Infosys BPM Services', invoice: 'INV-2026-891', amount: '₹1,24,000', status: 'Accepted & Synced', type: 'match' },
                    { supplier: 'Reliance Retail Ltd', invoice: 'RR-99412', amount: '₹46,800', status: 'Accepted & Synced', type: 'match' },
                    { supplier: 'Unknown Vendor / Portal Only', invoice: 'GST-X911', amount: '₹18,500', status: 'Rejected (Not in Books)', type: 'reject' },
                  ].map((row, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.75rem 1rem',
                        backgroundColor: 'var(--panel)',
                        borderRadius: '8px',
                        border: '1px solid var(--border)',
                        fontSize: '0.82rem',
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 600 }}>{row.supplier}</div>
                        <div style={{ color: 'var(--muted)', fontSize: '0.72rem' }}>Doc: {row.invoice}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600 }}>{row.amount}</div>
                        <div style={{ color: row.type === 'match' ? 'var(--green)' : 'var(--red)', fontSize: '0.72rem', fontWeight: 500 }}>
                          {row.status}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'ocr' && (
              <div
                style={{
                  backgroundColor: 'var(--panel-2)',
                  border: '1px solid var(--border)',
                  borderRadius: '12px',
                  padding: '1.25rem',
                  display: 'grid',
                  gridTemplateColumns: '1fr 1.2fr',
                  gap: '1.25rem',
                }}
              >
                <div
                  style={{
                    border: '1px dashed var(--border)',
                    borderRadius: '8px',
                    padding: '1.5rem',
                    textAlign: 'center',
                    backgroundColor: 'var(--panel)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <HugeiconsIcon icon={Camera01Icon} size={32} color="var(--accent)" />
                  <div style={{ fontWeight: 600, fontSize: '0.88rem', marginTop: '0.75rem' }}>Receipt_March_OfficeRent.pdf</div>
                  <div style={{ fontSize: '0.74rem', color: 'var(--muted)', marginTop: '0.25rem' }}>OCR Confidence: 98.4%</div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', justifyContent: 'center' }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted)' }}>Extracted Draft Journal Entry:</div>
                  <div style={{ padding: '0.65rem', backgroundColor: 'var(--panel)', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '0.78rem' }}>
                    <div><strong>Debit:</strong> Rent Expense (₹55,000)</div>
                    <div><strong>Debit:</strong> Input CGST 9% (₹4,950) + Input SGST 9% (₹4,950)</div>
                    <div><strong>Credit:</strong> Landlord Accounts Payable (₹64,900)</div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                    <button
                      onClick={onGoToAuth}
                      style={{
                        padding: '6px 14px',
                        backgroundColor: 'var(--accent)',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '0.76rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Confirm Entry
                    </button>
                    <span style={{ fontSize: '0.72rem', color: 'var(--muted)', alignSelf: 'center' }}>
                      Human confirms before posting
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── Core Feature Pillars ────────────────────────────────────────────── */}
      <section
        id="features"
        style={{
          maxWidth: '1200px',
          margin: '0 auto 6rem auto',
          padding: '0 1.5rem',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '3.5rem' }}>
          <h2
            style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: 'clamp(1.8rem, 3.5vw, 2.6rem)',
              fontWeight: 700,
              letterSpacing: '-0.03em',
              margin: '0 0 0.75rem 0',
            }}
          >
            Engineered for Accuracy. Built for Speed.
          </h2>
          <p style={{ color: 'var(--muted)', fontSize: '1.05rem', maxWidth: '620px', margin: '0 auto' }}>
            Everything Indian small businesses and chartered accountants need to run compliant, audit-ready books.
          </p>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: '1.5rem',
          }}
        >
          {/* Pillar 1 */}
          <div
            className="landing-feature-card"
            style={{
              backgroundColor: 'var(--panel)',
              border: '1px solid var(--border)',
              borderRadius: '14px',
              padding: '1.75rem',
              transition: 'all 0.25s ease',
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: '10px',
                backgroundColor: 'var(--accent-soft)',
                color: 'var(--accent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '1.25rem',
              }}
            >
              <HugeiconsIcon icon={AiBrain01Icon} size={22} />
            </div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 600, margin: '0 0 0.5rem 0' }}>
              AI Copilot with Grounding
            </h3>
            <p style={{ color: 'var(--muted)', fontSize: '0.88rem', lineHeight: 1.6, margin: 0 }}>
              The model never does math itself. It queries 24+ read-only tools against your double-entry ledger and drafts human-confirmed actions.
            </p>
          </div>

          {/* Pillar 2 */}
          <div
            className="landing-feature-card"
            style={{
              backgroundColor: 'var(--panel)',
              border: '1px solid var(--border)',
              borderRadius: '14px',
              padding: '1.75rem',
              transition: 'all 0.25s ease',
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: '10px',
                backgroundColor: 'rgba(16, 185, 129, 0.12)',
                color: 'var(--green)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '1.25rem',
              }}
            >
              <HugeiconsIcon icon={ShieldCheck} size={22} />
            </div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 600, margin: '0 0 0.5rem 0' }}>
              GST & IMS Reconciliation
            </h3>
            <p style={{ color: 'var(--muted)', fontSize: '0.88rem', lineHeight: 1.6, margin: 0 }}>
              Auto-reconcile supplier invoices under Indian Invoice Management System (IMS). Prevent deemed acceptance and claim 100% of your rightful ITC.
            </p>
          </div>

          {/* Pillar 3 */}
          <div
            className="landing-feature-card"
            style={{
              backgroundColor: 'var(--panel)',
              border: '1px solid var(--border)',
              borderRadius: '14px',
              padding: '1.75rem',
              transition: 'all 0.25s ease',
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: '10px',
                backgroundColor: 'rgba(245, 158, 11, 0.12)',
                color: 'var(--amber)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '1.25rem',
              }}
            >
              <HugeiconsIcon icon={Camera01Icon} size={22} />
            </div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 600, margin: '0 0 0.5rem 0' }}>
              OCR Document Capture
            </h3>
            <p style={{ color: 'var(--muted)', fontSize: '0.88rem', lineHeight: 1.6, margin: 0 }}>
              Snap phone photos of vendor bills or upload PDFs. Optical character recognition extracts line items into confident draft journal entries for approval.
            </p>
          </div>

          {/* Pillar 4 */}
          <div
            className="landing-feature-card"
            style={{
              backgroundColor: 'var(--panel)',
              border: '1px solid var(--border)',
              borderRadius: '14px',
              padding: '1.75rem',
              transition: 'all 0.25s ease',
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: '10px',
                backgroundColor: 'rgba(59, 130, 246, 0.12)',
                color: '#3b82f6',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '1.25rem',
              }}
            >
              <HugeiconsIcon icon={BarChartIcon} size={22} />
            </div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 600, margin: '0 0 0.5rem 0' }}>
              Monte Carlo Cash Forecast
            </h3>
            <p style={{ color: 'var(--muted)', fontSize: '0.88rem', lineHeight: 1.6, margin: 0 }}>
              Deterministic 13-week Monte Carlo simulations (P10/P50/P90). Know your exact cash runway weeks in advance with clear anomaly detection.
            </p>
          </div>
        </div>
      </section>

      {/* ── How It Works (3 Steps) ──────────────────────────────────────────── */}
      <section
        id="how-it-works"
        style={{
          backgroundColor: 'var(--panel-2)',
          borderTop: '1px solid var(--border)',
          borderBottom: '1px solid var(--border)',
          padding: '5rem 1.5rem',
        }}
      >
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '3.5rem' }}>
            <h2
              style={{
                fontFamily: "'Space Grotesk', sans-serif",
                fontSize: 'clamp(1.8rem, 3.5vw, 2.4rem)',
                fontWeight: 700,
                letterSpacing: '-0.03em',
                margin: '0 0 0.75rem 0',
              }}
            >
              How FinPilot Works
            </h2>
            <p style={{ color: 'var(--muted)', fontSize: '1.02rem', margin: 0 }}>
              From raw documents to audit-ready financial statements in three seamless steps.
            </p>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: '2rem',
            }}
          >
            {[
              {
                step: '01',
                title: 'Capture & Ingest',
                desc: 'Generate GST-compliant invoices with gapless numbering, snap bills via OCR, and import bank statements with duplicate fingerprinting.',
              },
              {
                step: '02',
                title: 'Post & Reconcile',
                desc: 'Every transaction posts to an append-only double-entry ledger. Bank transactions match automatically with scored suggestions you confirm.',
              },
              {
                step: '03',
                title: 'Ask & Comply',
                desc: 'Ask your Copilot any question in plain English, forecast your cash runway, and file GST returns with complete journal-entry auditability.',
              },
            ].map((item) => (
              <div
                key={item.step}
                style={{
                  backgroundColor: 'var(--panel)',
                  border: '1px solid var(--border)',
                  borderRadius: '14px',
                  padding: '2rem',
                  position: 'relative',
                }}
              >
                <div
                  style={{
                    fontSize: '2.5rem',
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontWeight: 700,
                    color: 'var(--accent)',
                    opacity: 0.35,
                    marginBottom: '0.75rem',
                  }}
                >
                  {item.step}
                </div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 600, margin: '0 0 0.5rem 0' }}>
                  {item.title}
                </h3>
                <p style={{ color: 'var(--muted)', fontSize: '0.9rem', lineHeight: 1.6, margin: 0 }}>
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Architecture & Tech Stack Showcase ──────────────────────────────── */}
      <section
        id="architecture"
        style={{
          maxWidth: '1100px',
          margin: '5.5rem auto',
          padding: '0 1.5rem',
        }}
      >
        <div
          style={{
            backgroundColor: 'var(--panel)',
            border: '1px solid var(--border)',
            borderRadius: '16px',
            padding: '2.5rem',
          }}
        >
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <h3
              style={{
                fontFamily: "'Space Grotesk', sans-serif",
                fontSize: '1.6rem',
                fontWeight: 700,
                margin: '0 0 0.5rem 0',
              }}
            >
              Enterprise-Grade Foundation
            </h3>
            <p style={{ color: 'var(--muted)', fontSize: '0.92rem', margin: 0 }}>
              Zero router bloat. One language across the stack. Strict invariants.
            </p>
          </div>

          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '10px',
              justifyContent: 'center',
            }}
          >
            {[
              'React 19 & Vite 6',
              'Strict TypeScript',
              'Node.js 22 & Express 5',
              'MongoDB 7 Replica Set',
              'Redis 7 & BullMQ',
              'Schedule III Indian Chart',
              'Append-Only Ledger Engine',
              'Razorpay Subscriptions',
              'MinIO S3 Storage',
              'Prometheus Observability',
            ].map((tech) => (
              <span
                key={tech}
                style={{
                  padding: '6px 14px',
                  borderRadius: '999px',
                  backgroundColor: 'var(--panel-2)',
                  border: '1px solid var(--border)',
                  fontSize: '0.82rem',
                  fontWeight: 500,
                  color: 'var(--text)',
                }}
              >
                {tech}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Bottom Call-to-Action ───────────────────────────────────────────── */}
      <section
        style={{
          backgroundColor: 'var(--panel)',
          borderTop: '1px solid var(--border)',
          padding: '5rem 1.5rem',
          textAlign: 'center',
          position: 'relative',
        }}
      >
        <div style={{ maxWidth: '700px', margin: '0 auto' }}>
          <h2
            style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: 'clamp(2rem, 4vw, 2.8rem)',
              fontWeight: 700,
              letterSpacing: '-0.03em',
              margin: '0 0 1rem 0',
            }}
          >
            Ready to experience books on autopilot?
          </h2>
          <p style={{ color: 'var(--muted)', fontSize: '1.05rem', margin: '0 0 2.25rem 0' }}>
            Access the complete dashboard, test the AI Copilot with real double-entry calculations, and explore your company ledger.
          </p>
          <button
            onClick={onGoToAuth}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              backgroundColor: 'var(--accent)',
              color: '#ffffff',
              border: 'none',
              padding: '0.9rem 2rem',
              borderRadius: '10px',
              fontSize: '1.05rem',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 4px 20px var(--accent-glow)',
              transition: 'all 0.2s ease',
            }}
            className="hero-primary-btn"
          >
            <span>Launch FinPilot AI</span>
            <HugeiconsIcon icon={ArrowRight01Icon} size={18} />
          </button>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <footer
        style={{
          backgroundColor: 'var(--panel-2)',
          borderTop: '1px solid var(--border)',
          padding: '2rem 1.5rem',
          fontSize: '0.82rem',
          color: 'var(--muted)',
        }}
      >
        <div
          style={{
            maxWidth: '1200px',
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, color: 'var(--text)' }}>
              Fin<span style={{ color: 'var(--accent)' }}>Pilot</span> AI
            </span>
            <span>— Cloud accounting for Indian SMEs</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
            <button
              onClick={onGoToAuth}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--muted)',
                cursor: 'pointer',
                fontSize: '0.82rem',
                padding: 0,
              }}
            >
              Sign In
            </button>
            <ThemeToggle />
          </div>
        </div>
      </footer>

      {/* Embedded landing styles */}
      <style>{`
        .landing-link {
          color: var(--muted);
          text-decoration: none;
          font-size: 0.88rem;
          font-weight: 500;
          transition: color 0.15s ease;
        }
        .landing-link:hover {
          color: var(--text);
        }
        .landing-signin-btn:hover {
          background-color: var(--accent-2) !important;
          transform: translateY(-1px);
        }
        .hero-primary-btn:hover {
          background-color: var(--accent-2) !important;
          transform: translateY(-2px);
        }
        .hero-secondary-btn:hover {
          background-color: var(--panel-2) !important;
          border-color: var(--muted) !important;
          transform: translateY(-1px);
        }
        .landing-feature-card:hover {
          border-color: var(--accent) !important;
          box-shadow: 0 8px 24px var(--accent-glow);
          transform: translateY(-3px);
        }
        @media (max-width: 768px) {
          .landing-nav-links {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}
