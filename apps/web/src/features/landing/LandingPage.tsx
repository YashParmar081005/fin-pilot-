import { useEffect, useRef, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import type { IconSvgElement } from '@hugeicons/react';
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
  Sun03Icon,
  Moon02Icon,
  Mail01Icon,
  SquareLock01Icon,
  UserIcon,
  Menu01Icon,
  Cancel01Icon,
  StarIcon,
  QuoteUpIcon,
  LinkedinIcon,
  TwitterIcon,
  Github01Icon,
  Rocket01Icon,
  ArrowLeft01Icon,
} from '@hugeicons/core-free-icons';

/* ────────────────────────────────────────────────────────────────────────
   Theme handling — persisted light / dark mode, applied via [data-theme]
   ──────────────────────────────────────────────────────────────────────── */

type Theme = 'light' | 'dark';

function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === 'undefined') return 'light';
    const stored = window.localStorage.getItem('finpilot-theme') as Theme | null;
    if (stored) return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    window.localStorage.setItem('finpilot-theme', theme);
  }, [theme]);

  return { theme, toggleTheme: () => setTheme((t) => (t === 'light' ? 'dark' : 'light')) };
}

function ThemeToggle({ theme, onToggle }: { theme: Theme; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      aria-label="Toggle color theme"
      className="fp-theme-toggle"
      style={{
        width: 38,
        height: 38,
        borderRadius: '10px',
        border: '1px solid var(--border)',
        backgroundColor: 'var(--panel-2)',
        color: 'var(--text)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        flexShrink: 0,
      }}
    >
      <HugeiconsIcon icon={theme === 'light' ? Moon02Icon : Sun03Icon} size={17} />
    </button>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   Scroll-reveal wrapper — small IntersectionObserver based fade/slide-in
   ──────────────────────────────────────────────────────────────────────── */

function Reveal({
  children,
  delay = 0,
  style,
}: {
  children: React.ReactNode;
  delay?: number;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.12 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(22px)',
        transition: `opacity 0.65s cubic-bezier(0.16,1,0.3,1) ${delay}ms, transform 0.65s cubic-bezier(0.16,1,0.3,1) ${delay}ms`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   Shared data
   ──────────────────────────────────────────────────────────────────────── */

const NAV_LINKS = [
  { href: '#features', label: 'Features' },
  { href: '#preview', label: 'Product Tour' },
  { href: '#how-it-works', label: 'How It Works' },
  { href: '#pricing', label: 'Pricing' },
  { href: '#architecture', label: 'Architecture' },
];

const STATS = [
  { icon: Building01Icon, value: '4,000+', label: 'Indian businesses onboard' },
  { icon: BankIcon, value: '₹840Cr+', label: 'Reconciled every month' },
  { icon: ShieldCheck, value: '99.99%', label: 'Platform uptime SLA' },
  { icon: AiBrain01Icon, value: '0', label: 'AI math hallucinations' },
];

const FEATURES: { icon: IconSvgElement; color: string; bg: string; title: string; desc: string }[] = [
  {
    icon: AiBrain01Icon,
    color: 'var(--accent)',
    bg: 'var(--accent-soft)',
    title: 'AI Copilot with Grounding',
    desc: 'The model never does math itself. It queries 24+ read-only tools against your double-entry ledger and drafts human-confirmed actions.',
  },
  {
    icon: ShieldCheck,
    color: 'var(--green)',
    bg: 'var(--green-soft)',
    title: 'GST & IMS Reconciliation',
    desc: 'Auto-reconcile supplier invoices under the Indian Invoice Management System. Prevent deemed acceptance and claim 100% of rightful ITC.',
  },
  {
    icon: Camera01Icon,
    color: 'var(--amber)',
    bg: 'var(--amber-soft)',
    title: 'OCR Document Capture',
    desc: 'Snap phone photos of vendor bills or upload PDFs. OCR extracts line items into confident draft journal entries for your approval.',
  },
  {
    icon: BarChartIcon,
    color: 'var(--blue)',
    bg: 'var(--blue-soft)',
    title: 'Monte Carlo Cash Forecast',
    desc: 'Deterministic 13-week Monte Carlo simulations (P10/P50/P90). Know your exact cash runway weeks in advance with anomaly detection.',
  },
  {
    icon: Invoice01Icon,
    color: 'var(--accent)',
    bg: 'var(--accent-soft)',
    title: 'GST-Compliant Invoicing',
    desc: 'Generate e-invoices with gapless numbering, auto tax splits, and QR codes — fully aligned with Schedule III reporting requirements.',
  },
  {
    icon: BankIcon,
    color: 'var(--green)',
    bg: 'var(--green-soft)',
    title: 'Multi-Bank Reconciliation',
    desc: 'Import statements from any Indian bank with duplicate fingerprinting and scored auto-match suggestions you simply confirm.',
  },
];

const STEPS = [
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
];

const TECH_STACK = [
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
];

const TESTIMONIALS = [
  {
    quote:
      'FinPilot replaced two spreadsheets and an outsourced bookkeeper. The GST IMS reconciliation alone saves us three full days every month.',
    name: 'Priya Raghunathan',
    role: 'Founder, Weave Textiles',
  },
  {
    quote:
      'Our CA finally trusts the AI answers because every number traces back to a real ledger entry. No more “where did this figure come from”.',
    name: 'Arjun Mehta',
    role: 'CFO, Northline Logistics',
  },
  {
    quote:
      'The cash forecast alone paid for itself — we renegotiated vendor terms three weeks before a crunch the Monte Carlo model flagged.',
    name: 'Sana Fernandes',
    role: 'COO, Bloom & Barrel',
  },
];

const PRICING_PLANS = [
  {
    name: 'Starter',
    price: '₹1,499',
    period: '/month',
    desc: 'For solo founders and freelancers getting their books in order.',
    features: ['Up to 100 invoices/mo', 'Single bank account sync', 'Basic GST filing', 'Email support'],
    highlighted: false,
    icon: Invoice01Icon,
  },
  {
    name: 'Growth',
    price: '₹4,999',
    period: '/month',
    desc: 'For growing SMEs that need automation and a real AI Copilot.',
    features: [
      'Unlimited invoices',
      'Unlimited bank accounts',
      'Full GST IMS reconciliation',
      'AI Copilot & OCR capture',
      'Monte Carlo cash forecasts',
      'Priority chat support',
    ],
    highlighted: true,
    icon: SparklesIcon,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    desc: 'For multi-entity groups and CA firms managing many clients.',
    features: [
      'Everything in Growth',
      'Multi-entity consolidation',
      'Dedicated account manager',
      'Custom SLAs & audit trail exports',
      'SSO & role-based access',
    ],
    highlighted: false,
    icon: Rocket01Icon,
  },
];

const FOOTER_COLUMNS = [
  {
    title: 'Product',
    links: ['Features', 'Product Tour', 'Pricing', 'Architecture'],
  },
  {
    title: 'Company',
    links: ['About Us', 'Careers', 'Blog', 'Contact'],
  },
  {
    title: 'Resources',
    links: ['Help Center', 'API Docs', 'GST Guide', 'Community'],
  },
  {
    title: 'Legal',
    links: ['Privacy Policy', 'Terms of Service', 'Security', 'Compliance'],
  },
];

/* ────────────────────────────────────────────────────────────────────────
   Landing Page
   ──────────────────────────────────────────────────────────────────────── */

export function LandingPage({
  onGoToAuth,
  theme: propTheme,
  toggleTheme: propToggleTheme,
}: {
  onGoToAuth: () => void;
  theme?: Theme;
  toggleTheme?: () => void;
}) {
  const internalTheme = useTheme();
  const theme = propTheme ?? internalTheme.theme;
  const toggleTheme = propToggleTheme ?? internalTheme.toggleTheme;
  const [activeTab, setActiveTab] = useState<'dashboard' | 'copilot' | 'gst' | 'ocr'>('dashboard');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <>
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
      {/* ── Top Navbar ──────────────────────────────────────────────────── */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          backgroundColor: 'var(--nav-bg)',
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
            style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', userSelect: 'none' }}
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          >
            <span
              style={{
                width: 32,
                height: 32,
                borderRadius: '9px',
                background: 'linear-gradient(135deg, var(--accent) 0%, #ff7744 100%)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 14px var(--accent-glow)',
              }}
            >
              <HugeiconsIcon icon={SparklesIcon} size={17} color="#fff" />
            </span>
            <span
              style={{
                fontSize: '1.4rem',
                fontFamily: "'Space Grotesk', sans-serif",
                fontWeight: 600,
                letterSpacing: '-0.03em',
                color: 'var(--text)',
                display: 'inline-flex',
                alignItems: 'center',
              }}
            >
              Fin
              <span style={{ fontWeight: 700, color: 'var(--accent)', marginLeft: '2px' }}>Pilot</span>
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
          <nav style={{ display: 'flex', alignItems: 'center', gap: '1.75rem' }} className="landing-nav-links">
            {NAV_LINKS.map((link) => (
              <a key={link.href} href={link.href} className="landing-link">
                {link.label}
              </a>
            ))}
          </nav>

          {/* Right Action */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem' }}>
            <ThemeToggle theme={theme} onToggle={toggleTheme} />
            <button onClick={onGoToAuth} className="landing-signin-btn fp-btn-desktop-only">
              <span>Sign In</span>
              <HugeiconsIcon icon={ArrowRight01Icon} size={15} />
            </button>
            <button
              className="fp-mobile-menu-btn"
              onClick={() => setMobileNavOpen((v) => !v)}
              aria-label="Toggle menu"
              style={{
                display: 'none',
                width: 38,
                height: 38,
                borderRadius: '10px',
                border: '1px solid var(--border)',
                backgroundColor: 'var(--panel-2)',
                color: 'var(--text)',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <HugeiconsIcon icon={mobileNavOpen ? Cancel01Icon : Menu01Icon} size={18} />
            </button>
          </div>
        </div>

        {/* Mobile nav drawer */}
        {mobileNavOpen && (
          <div
            className="fp-mobile-drawer"
            style={{
              borderTop: '1px solid var(--border)',
              backgroundColor: 'var(--panel)',
              padding: '1rem 1.5rem 1.5rem 1.5rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.9rem',
            }}
          >
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="landing-link"
                onClick={() => setMobileNavOpen(false)}
                style={{ fontSize: '0.95rem' }}
              >
                {link.label}
              </a>
            ))}
            <button
              onClick={onGoToAuth}
              className="landing-signin-btn"
              style={{ justifyContent: 'center', width: '100%' }}
            >
              <span>Sign In</span>
              <HugeiconsIcon icon={ArrowRight01Icon} size={15} />
            </button>
          </div>
        )}
      </header>

      {/* ── Hero Section ────────────────────────────────────────────────── */}
      <section
        style={{
          position: 'relative',
          padding: '5rem 1.5rem 3rem 1.5rem',
          maxWidth: '1200px',
          margin: '0 auto',
          textAlign: 'center',
        }}
      >
        {/* Background ambient mesh */}
        <div className="fp-hero-glow-a" />
        <div className="fp-hero-glow-b" />
        <div className="fp-grid-overlay" />

        <div style={{ position: 'relative', zIndex: 1 }}>
          <Reveal>
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
              }}
            >
              <HugeiconsIcon icon={SparklesIcon} size={15} color="var(--accent)" />
              <span>Automated Accounting for Indian SMEs • GST IMS 2.0 Ready</span>
            </div>
          </Reveal>

          <Reveal delay={80}>
            <h1
              style={{
                fontFamily: "'Space Grotesk', -apple-system, sans-serif",
                fontSize: 'clamp(2.3rem, 5.5vw, 4.2rem)',
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
          </Reveal>

          <Reveal delay={140}>
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
          </Reveal>

          <Reveal delay={200}>
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
              <button onClick={onGoToAuth} className="hero-primary-btn">
                <span>Get Started / Sign In</span>
                <HugeiconsIcon icon={ArrowRight01Icon} size={18} />
              </button>

              <a href="#preview" className="hero-secondary-btn">
                <span>Live Feature Tour</span>
                <HugeiconsIcon icon={Analytics01Icon} size={17} color="var(--muted)" />
              </a>
            </div>
          </Reveal>

          <Reveal delay={260}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '1.5rem',
                flexWrap: 'wrap',
                fontSize: '0.85rem',
                color: 'var(--muted)',
                marginBottom: '4rem',
              }}
            >
              {[
                'Schedule III Indian Chart',
                'Append-Only Reversible Entries',
                'Zero AI Math Hallucinations',
                '1-Click GST IMS Reconciliation',
              ].map((item) => (
                <span key={item} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <HugeiconsIcon icon={CheckmarkCircle02Icon} size={16} color="var(--green)" />
                  {item}
                </span>
              ))}
            </div>
          </Reveal>

          {/* Stats bar */}
          <Reveal delay={320}>
            <div className="fp-stats-grid">
              {STATS.map((s) => (
                <div key={s.label} className="fp-stat-card">
                  <div className="fp-stat-icon">
                    <HugeiconsIcon icon={s.icon} size={18} />
                  </div>
                  <div style={{ textAlign: 'left' }}>
                    <div className="fp-stat-value">{s.value}</div>
                    <div className="fp-stat-label">{s.label}</div>
                  </div>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── Interactive Product Showcase ───────────────────────────────── */}
      <section id="preview" style={{ maxWidth: '1120px', margin: '0 auto 6rem auto', padding: '0 1.5rem' }}>
        <Reveal>
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
                flexWrap: 'wrap',
                gap: '0.75rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#ef4444' }} />
                <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#f59e0b' }} />
                <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#10b981' }} />
                <span
                  className="fp-hide-on-small"
                  style={{ marginLeft: 12, fontSize: '0.78rem', color: 'var(--muted)', fontWeight: 500 }}
                >
                  app.finpilot.ai — Acme Enterprises Private Limited (FY 2026-27)
                </span>
              </div>

              {/* Interactive Tab Switcher */}
              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
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
                    <span className="fp-hide-on-small">{tab.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Mockup Body Content */}
            <div style={{ padding: '1.75rem' }} key={activeTab} className="fp-tab-fade">
              {activeTab === 'dashboard' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
                  <div className="fp-metric-card">
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

                  <div className="fp-metric-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <span style={{ fontSize: '0.8rem', color: 'var(--muted)', fontWeight: 500 }}>13-Week Cash Forecast</span>
                      <span
                        style={{
                          fontSize: '0.72rem',
                          backgroundColor: 'var(--accent-soft)',
                          color: 'var(--accent)',
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontWeight: 600,
                        }}
                      >
                        Monte Carlo P50
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: '1.8rem',
                        fontWeight: 700,
                        fontFamily: "'IBM Plex Mono', monospace",
                        color: 'var(--accent)',
                      }}
                    >
                      ₹31,15,000
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: '0.35rem' }}>
                      Runway: 98 days (90% confidence &gt; ₹19.4L)
                    </div>
                  </div>

                  <div className="fp-metric-card">
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
                <div className="fp-metric-card" style={{ padding: '1.5rem' }}>
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

                  <div
                    style={{
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
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        marginBottom: '0.5rem',
                        color: 'var(--accent)',
                        fontWeight: 600,
                        fontSize: '0.78rem',
                      }}
                    >
                      <HugeiconsIcon icon={SparklesIcon} size={14} />
                      <span>Engine-Validated Answer (0 Math Hallucinations)</span>
                    </div>
                    <p style={{ margin: '0 0 0.5rem 0' }}>
                      Based on your verified ledger and current bank balances (
                      <strong style={{ fontFamily: "'IBM Plex Mono', monospace" }}>₹24,80,450</strong>):
                    </p>
                    <ul style={{ margin: '0 0 0.75rem 1.25rem', padding: 0 }}>
                      <li>
                        Paying top 3 bills (Apex Logistics ₹1,42,000, Cloudways ₹84,500, Star Pack ₹52,100) totals{' '}
                        <strong>₹2,78,600</strong>.
                      </li>
                      <li>
                        Expected AR customer collections by the 14th: <strong>₹3,40,000</strong>.
                      </li>
                    </ul>
                    <div
                      style={{
                        padding: '0.5rem 0.75rem',
                        backgroundColor: 'var(--panel-2)',
                        borderRadius: '6px',
                        fontWeight: 600,
                        display: 'inline-block',
                      }}
                    >
                      Projected Cash Balance on 15th:{' '}
                      <span style={{ color: 'var(--accent)', fontFamily: "'IBM Plex Mono', monospace" }}>₹25,41,850</span>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'gst' && (
                <div className="fp-metric-card">
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '1rem',
                      flexWrap: 'wrap',
                      gap: '0.75rem',
                    }}
                  >
                    <div>
                      <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600 }}>
                        GSTR-2B vs. Books Reconciliation (IMS)
                      </h4>
                      <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                        Tax Period: March 2026 • Cutoff: 14th midnight
                      </span>
                    </div>
                    <span
                      style={{
                        padding: '4px 10px',
                        borderRadius: '6px',
                        backgroundColor: 'var(--green-soft)',
                        color: 'var(--green)',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                      }}
                    >
                      100% Tax Credit Claimable
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {[
                      {
                        supplier: 'Infosys BPM Services',
                        invoice: 'INV-2026-891',
                        amount: '₹1,24,000',
                        status: 'Accepted & Synced',
                        type: 'match',
                      },
                      {
                        supplier: 'Reliance Retail Ltd',
                        invoice: 'RR-99412',
                        amount: '₹46,800',
                        status: 'Accepted & Synced',
                        type: 'match',
                      },
                      {
                        supplier: 'Unknown Vendor / Portal Only',
                        invoice: 'GST-X911',
                        amount: '₹18,500',
                        status: 'Rejected (Not in Books)',
                        type: 'reject',
                      },
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
                          gap: '0.75rem',
                          flexWrap: 'wrap',
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 600 }}>{row.supplier}</div>
                          <div style={{ color: 'var(--muted)', fontSize: '0.72rem' }}>Doc: {row.invoice}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600 }}>{row.amount}</div>
                          <div
                            style={{
                              color: row.type === 'match' ? 'var(--green)' : 'var(--red)',
                              fontSize: '0.72rem',
                              fontWeight: 500,
                            }}
                          >
                            {row.status}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === 'ocr' && (
                <div className="fp-metric-card fp-ocr-grid">
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
                    <div style={{ fontWeight: 600, fontSize: '0.88rem', marginTop: '0.75rem' }}>
                      Receipt_March_OfficeRent.pdf
                    </div>
                    <div style={{ fontSize: '0.74rem', color: 'var(--muted)', marginTop: '0.25rem' }}>
                      OCR Confidence: 98.4%
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', justifyContent: 'center' }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--muted)' }}>
                      Extracted Draft Journal Entry:
                    </div>
                    <div
                      style={{
                        padding: '0.65rem',
                        backgroundColor: 'var(--panel)',
                        borderRadius: '6px',
                        border: '1px solid var(--border)',
                        fontSize: '0.78rem',
                      }}
                    >
                      <div>
                        <strong>Debit:</strong> Rent Expense (₹55,000)
                      </div>
                      <div>
                        <strong>Debit:</strong> Input CGST 9% (₹4,950) + Input SGST 9% (₹4,950)
                      </div>
                      <div>
                        <strong>Credit:</strong> Landlord Accounts Payable (₹64,900)
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '4px', flexWrap: 'wrap' }}>
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
        </Reveal>
      </section>

      {/* ── Core Feature Pillars ────────────────────────────────────────── */}
      <section id="features" style={{ maxWidth: '1200px', margin: '0 auto 6rem auto', padding: '0 1.5rem' }}>
        <Reveal>
          <div style={{ textAlign: 'center', marginBottom: '3.5rem' }}>
            <span className="fp-eyebrow">Why FinPilot</span>
            <h2 className="fp-h2">Engineered for Accuracy. Built for Speed.</h2>
            <p style={{ color: 'var(--muted)', fontSize: '1.05rem', maxWidth: '620px', margin: '0.75rem auto 0 auto' }}>
              Everything Indian small businesses and chartered accountants need to run compliant, audit-ready books.
            </p>
          </div>
        </Reveal>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} delay={i * 70}>
              <div className="landing-feature-card">
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: '10px',
                    backgroundColor: f.bg,
                    color: f.color,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: '1.25rem',
                  }}
                >
                  <HugeiconsIcon icon={f.icon} size={22} />
                </div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 600, margin: '0 0 0.5rem 0' }}>{f.title}</h3>
                <p style={{ color: 'var(--muted)', fontSize: '0.88rem', lineHeight: 1.6, margin: 0 }}>{f.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── How It Works ────────────────────────────────────────────────── */}
      <section
        id="how-it-works"
        style={{
          backgroundColor: 'var(--panel-2)',
          borderTop: '1px solid var(--border)',
          borderBottom: '1px solid var(--border)',
          padding: '5.5rem 1.5rem',
        }}
      >
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <Reveal>
            <div style={{ textAlign: 'center', marginBottom: '3.5rem' }}>
              <span className="fp-eyebrow">The Workflow</span>
              <h2 className="fp-h2" style={{ fontSize: 'clamp(1.8rem, 3.5vw, 2.4rem)' }}>
                How FinPilot Works
              </h2>
              <p style={{ color: 'var(--muted)', fontSize: '1.02rem', margin: '0.75rem 0 0 0' }}>
                From raw documents to audit-ready financial statements in three seamless steps.
              </p>
            </div>
          </Reveal>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '2rem' }}>
            {STEPS.map((item, i) => (
              <Reveal key={item.step} delay={i * 100}>
                <div className="fp-step-card">
                  <div className="fp-step-number">{item.step}</div>
                  <h3 style={{ fontSize: '1.2rem', fontWeight: 600, margin: '0 0 0.5rem 0' }}>{item.title}</h3>
                  <p style={{ color: 'var(--muted)', fontSize: '0.9rem', lineHeight: 1.6, margin: 0 }}>{item.desc}</p>
                  {i < STEPS.length - 1 && (
                    <span className="fp-step-arrow fp-hide-on-small">
                      <HugeiconsIcon icon={ArrowRight01Icon} size={18} />
                    </span>
                  )}
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Testimonials ─────────────────────────────────────────────────── */}
      <section style={{ maxWidth: '1200px', margin: '6rem auto', padding: '0 1.5rem' }}>
        <Reveal>
          <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
            <span className="fp-eyebrow">Loved by Founders & CAs</span>
            <h2 className="fp-h2">Trusted by teams who take their books seriously</h2>
          </div>
        </Reveal>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
          {TESTIMONIALS.map((t, i) => (
            <Reveal key={t.name} delay={i * 90}>
              <div className="fp-testimonial-card">
                <HugeiconsIcon icon={QuoteUpIcon} size={24} color="var(--accent)" />
                <p style={{ fontSize: '0.92rem', lineHeight: 1.65, color: 'var(--text)', margin: '1rem 0 1.25rem 0' }}>
                  “{t.quote}”
                </p>
                <div style={{ display: 'flex', gap: '2px', marginBottom: '0.75rem' }}>
                  {Array.from({ length: 5 }).map((_, idx) => (
                    <HugeiconsIcon key={idx} icon={StarIcon} size={14} color="var(--amber)" />
                  ))}
                </div>
                <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{t.name}</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>{t.role}</div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── Pricing ─────────────────────────────────────────────────────── */}
      <section
        id="pricing"
        style={{
          backgroundColor: 'var(--panel-2)',
          borderTop: '1px solid var(--border)',
          borderBottom: '1px solid var(--border)',
          padding: '5.5rem 1.5rem',
        }}
      >
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <Reveal>
            <div style={{ textAlign: 'center', marginBottom: '3.5rem' }}>
              <span className="fp-eyebrow">Simple Pricing</span>
              <h2 className="fp-h2" style={{ fontSize: 'clamp(1.8rem, 3.5vw, 2.4rem)' }}>
                Plans that scale with your business
              </h2>
              <p style={{ color: 'var(--muted)', fontSize: '1.02rem', margin: '0.75rem 0 0 0' }}>
                Transparent monthly pricing in INR. No hidden setup fees, cancel anytime.
              </p>
            </div>
          </Reveal>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))', gap: '1.5rem' }}>
            {PRICING_PLANS.map((plan, i) => (
              <Reveal key={plan.name} delay={i * 90}>
                <div className={`fp-pricing-card ${plan.highlighted ? 'fp-pricing-highlighted' : ''}`}>
                  {plan.highlighted && <span className="fp-pricing-badge">Most Popular</span>}
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: '10px',
                      backgroundColor: plan.highlighted ? 'rgba(255,255,255,0.18)' : 'var(--accent-soft)',
                      color: plan.highlighted ? '#fff' : 'var(--accent)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: '1.1rem',
                    }}
                  >
                    <HugeiconsIcon icon={plan.icon} size={20} />
                  </div>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0 0 0.35rem 0' }}>{plan.name}</h3>
                  <p
                    style={{
                      fontSize: '0.82rem',
                      lineHeight: 1.5,
                      margin: '0 0 1.1rem 0',
                      color: plan.highlighted ? 'rgba(255,255,255,0.85)' : 'var(--muted)',
                    }}
                  >
                    {plan.desc}
                  </p>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', marginBottom: '1.4rem' }}>
                    <span style={{ fontSize: '2rem', fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif" }}>
                      {plan.price}
                    </span>
                    <span
                      style={{
                        fontSize: '0.85rem',
                        color: plan.highlighted ? 'rgba(255,255,255,0.75)' : 'var(--muted)',
                      }}
                    >
                      {plan.period}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '1.5rem' }}>
                    {plan.features.map((feat) => (
                      <div key={feat} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
                        <HugeiconsIcon
                          icon={CheckmarkCircle02Icon}
                          size={16}
                          color={plan.highlighted ? '#fff' : 'var(--green)'}
                        />
                        <span>{feat}</span>
                      </div>
                    ))}
                  </div>
                  <button onClick={onGoToAuth} className={`fp-pricing-btn ${plan.highlighted ? 'fp-pricing-btn-light' : ''}`}>
                    Choose {plan.name}
                  </button>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Architecture & Tech Stack ───────────────────────────────────── */}
      <section id="architecture" style={{ maxWidth: '1100px', margin: '6rem auto', padding: '0 1.5rem' }}>
        <Reveal>
          <div className="fp-arch-panel">
            <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
              <h3 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '1.6rem', fontWeight: 700, margin: '0 0 0.5rem 0' }}>
                Enterprise-Grade Foundation
              </h3>
              <p style={{ color: 'var(--muted)', fontSize: '0.92rem', margin: 0 }}>
                Zero router bloat. One language across the stack. Strict invariants.
              </p>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', justifyContent: 'center' }}>
              {TECH_STACK.map((tech) => (
                <span key={tech} className="fp-tech-chip">
                  {tech}
                </span>
              ))}
            </div>
          </div>
        </Reveal>
      </section>

      {/* ── Bottom CTA ──────────────────────────────────────────────────── */}
      <section className="fp-cta-section">
        <div className="fp-cta-glow" />
        <div style={{ maxWidth: '700px', margin: '0 auto', position: 'relative', zIndex: 1 }}>
          <Reveal>
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
              Access the complete dashboard, test the AI Copilot with real double-entry calculations, and explore your
              company ledger.
            </p>
            <button onClick={onGoToAuth} className="hero-primary-btn">
              <span>Launch FinPilot AI</span>
              <HugeiconsIcon icon={ArrowRight01Icon} size={18} />
            </button>
          </Reveal>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer style={{ backgroundColor: 'var(--panel-2)', borderTop: '1px solid var(--border)', padding: '3.5rem 1.5rem 2rem 1.5rem' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <div className="fp-footer-grid">
            <div style={{ maxWidth: '280px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.9rem' }}>
                <span
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: '8px',
                    background: 'linear-gradient(135deg, var(--accent) 0%, #ff7744 100%)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <HugeiconsIcon icon={SparklesIcon} size={14} color="#fff" />
                </span>
                <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, color: 'var(--text)' }}>
                  Fin<span style={{ color: 'var(--accent)' }}>Pilot</span> AI
                </span>
              </div>
              <p style={{ fontSize: '0.85rem', color: 'var(--muted)', lineHeight: 1.6, margin: '0 0 1.25rem 0' }}>
                Cloud accounting built for Indian SMEs — grounded AI, GST IMS automation, and audit-ready books.
              </p>
              <div style={{ display: 'flex', gap: '8px' }}>
                {[LinkedinIcon, TwitterIcon, Github01Icon].map((icon, idx) => (
                  <a key={idx} href="#" className="fp-social-btn" aria-label="Social link">
                    <HugeiconsIcon icon={icon} size={16} />
                  </a>
                ))}
              </div>
            </div>

            {FOOTER_COLUMNS.map((col) => (
              <div key={col.title}>
                <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '1rem', color: 'var(--text)' }}>
                  {col.title}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                  {col.links.map((link) => (
                    <a key={link} href="#" className="landing-link" style={{ fontSize: '0.85rem' }}>
                      {link}
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div
            style={{
              marginTop: '3rem',
              paddingTop: '1.5rem',
              borderTop: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '1rem',
              fontSize: '0.8rem',
              color: 'var(--muted)',
            }}
          >
            <span>© {new Date().getFullYear()} FinPilot AI. All rights reserved.</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
              <button
                onClick={onGoToAuth}
                style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '0.8rem', padding: 0 }}
              >
                Sign In
              </button>
              <ThemeToggle theme={theme} onToggle={toggleTheme} />
            </div>
          </div>
        </div>
      </footer>
    </div>
    <LandingStyles />
  </>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   Auth Page — polished sign-in / sign-up screen
   ──────────────────────────────────────────────────────────────────────── */

function AuthPage({ onBack, theme, toggleTheme }: { onBack: () => void; theme: Theme; toggleTheme: () => void }) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [submitted, setSubmitted] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: 'var(--bg)',
        color: 'var(--text)',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
        display: 'grid',
        gridTemplateColumns: '1.1fr 1fr',
      }}
      className="fp-auth-shell"
    >
      {/* Left brand panel */}
      <div className="fp-auth-brand">
        <div className="fp-hero-glow-a" style={{ opacity: 0.6 }} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3rem', cursor: 'pointer' }} onClick={onBack}>
            <span
              style={{
                width: 32,
                height: 32,
                borderRadius: '9px',
                background: 'rgba(255,255,255,0.16)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <HugeiconsIcon icon={SparklesIcon} size={17} color="#fff" />
            </span>
            <span style={{ fontSize: '1.4rem', fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, color: '#fff' }}>
              FinPilot <span style={{ opacity: 0.85 }}>AI</span>
            </span>
          </div>

          <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '2.2rem', fontWeight: 700, color: '#fff', lineHeight: 1.2, margin: '0 0 1rem 0', letterSpacing: '-0.03em' }}>
            Precision accounting, powered by grounded AI.
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: '1rem', lineHeight: 1.6, marginBottom: '2.5rem', maxWidth: '440px' }}>
            Join thousands of Indian businesses running GST-compliant, audit-ready books on autopilot.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {[
              'Double-entry ledger with zero math hallucinations',
              '1-click GST IMS reconciliation before the 14th cutoff',
              '13-week Monte Carlo cash runway forecasting',
            ].map((item) => (
              <div key={item} style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#fff' }}>
                <HugeiconsIcon icon={CheckmarkCircle02Icon} size={18} color="#fff" />
                <span style={{ fontSize: '0.92rem' }}>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right form panel */}
      <div className="fp-auth-form-wrap">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', maxWidth: '400px' }}>
          <button onClick={onBack} className="fp-back-link">
            <HugeiconsIcon icon={ArrowLeft01Icon} size={16} />
            <span>Back to home</span>
          </button>
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
        </div>

        <div style={{ width: '100%', maxWidth: '400px', marginTop: '2.5rem' }}>
          {submitted ? (
            <div style={{ textAlign: 'center', padding: '2rem 0' }}>
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: '50%',
                  backgroundColor: 'var(--green-soft)',
                  color: 'var(--green)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 1.25rem auto',
                }}
              >
                <HugeiconsIcon icon={CheckmarkCircle02Icon} size={28} />
              </div>
              <h3 style={{ fontSize: '1.3rem', fontWeight: 700, margin: '0 0 0.5rem 0' }}>You're all set!</h3>
              <p style={{ color: 'var(--muted)', fontSize: '0.9rem', marginBottom: '1.75rem' }}>
                This is a demo experience — your FinPilot workspace would open right here.
              </p>
              <button onClick={onBack} className="hero-primary-btn" style={{ width: '100%', justifyContent: 'center' }}>
                <span>Back to Home</span>
                <HugeiconsIcon icon={ArrowRight01Icon} size={16} />
              </button>
            </div>
          ) : (
            <>
              <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: '1.7rem', fontWeight: 700, margin: '0 0 0.4rem 0' }}>
                {mode === 'signin' ? 'Welcome back' : 'Create your account'}
              </h2>
              <p style={{ color: 'var(--muted)', fontSize: '0.9rem', marginBottom: '1.75rem' }}>
                {mode === 'signin' ? 'Sign in to access your FinPilot dashboard.' : 'Start your 14-day free trial. No card required.'}
              </p>

              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {mode === 'signup' && (
                  <label className="fp-input-wrap">
                    <HugeiconsIcon icon={UserIcon} size={17} color="var(--muted)" />
                    <input
                      type="text"
                      placeholder="Full name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                    />
                  </label>
                )}
                <label className="fp-input-wrap">
                  <HugeiconsIcon icon={Mail01Icon} size={17} color="var(--muted)" />
                  <input
                    type="email"
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </label>
                <label className="fp-input-wrap">
                  <HugeiconsIcon icon={SquareLock01Icon} size={17} color="var(--muted)" />
                  <input
                    type="password"
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </label>

                {mode === 'signin' && (
                  <div style={{ textAlign: 'right' }}>
                    <a href="#" className="landing-link" style={{ fontSize: '0.8rem' }}>
                      Forgot password?
                    </a>
                  </div>
                )}

                <button type="submit" className="hero-primary-btn" style={{ width: '100%', justifyContent: 'center', marginTop: '0.5rem' }}>
                  <span>{mode === 'signin' ? 'Sign In' : 'Create Account'}</span>
                  <HugeiconsIcon icon={ArrowRight01Icon} size={16} />
                </button>
              </form>

              <p style={{ textAlign: 'center', fontSize: '0.85rem', color: 'var(--muted)', marginTop: '1.75rem' }}>
                {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
                <button
                  onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
                  style={{ background: 'none', border: 'none', color: 'var(--accent)', fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem', padding: 0 }}
                >
                  {mode === 'signin' ? 'Sign up free' : 'Sign in'}
                </button>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────
   Landing styles
   ──────────────────────────────────────────────────────────────────────── */

function LandingStyles() {
  return (
    <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&family=IBM+Plex+Mono:wght@500;600;700&display=swap');

        :root {
          --bg: #fbfbfa;
          --panel: #ffffff;
          --panel-2: #f5f6f8;
          --panel-3: #eef0f3;
          --border: #e6e8eb;
          --text: #10131a;
          --muted: #6b7280;
          --accent: #ff4404;
          --accent-2: #e23e02;
          --accent-soft: rgba(255, 68, 4, 0.08);
          --accent-glow: rgba(255, 68, 4, 0.22);
          --green: #059669;
          --green-soft: rgba(5, 150, 105, 0.1);
          --amber: #d97706;
          --amber-soft: rgba(217, 119, 6, 0.1);
          --red: #dc2626;
          --red-soft: rgba(220, 38, 38, 0.1);
          --blue: #2563eb;
          --blue-soft: rgba(37, 99, 235, 0.1);
          --shadow-lift: 0 24px 70px -24px rgba(16, 24, 40, 0.22), 0 8px 24px -8px rgba(16, 24, 40, 0.08);
          --nav-bg: rgba(251, 251, 250, 0.82);
        }
        [data-theme='dark'] {
          --bg: #08090b;
          --panel: #101319;
          --panel-2: #161a21;
          --panel-3: #1d222b;
          --border: #262b34;
          --text: #f3f4f6;
          --muted: #98a1ae;
          --accent: #ff5a1f;
          --accent-2: #ff7a3d;
          --accent-soft: rgba(255, 90, 31, 0.14);
          --accent-glow: rgba(255, 90, 31, 0.32);
          --green: #34d399;
          --green-soft: rgba(52, 211, 153, 0.12);
          --amber: #fbbf24;
          --amber-soft: rgba(251, 191, 36, 0.12);
          --red: #f87171;
          --red-soft: rgba(248, 113, 113, 0.12);
          --blue: #60a5fa;
          --blue-soft: rgba(96, 165, 250, 0.12);
          --shadow-lift: 0 24px 70px -24px rgba(0, 0, 0, 0.7), 0 8px 24px -8px rgba(0, 0, 0, 0.5);
          --nav-bg: rgba(8, 9, 11, 0.75);
        }

        * { box-sizing: border-box; }
        body { background-color: var(--bg); }

        @keyframes fp-fade-up {
          from { opacity: 0; transform: translateY(14px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fp-tab-fade {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fp-drift {
          0%, 100% { transform: translate(-50%, 0) scale(1); }
          50% { transform: translate(-50%, -18px) scale(1.05); }
        }

        .fp-tab-fade { animation: fp-tab-fade 0.35s ease both; }

        .fp-hero-glow-a {
          position: absolute;
          top: -60px;
          left: 50%;
          transform: translateX(-50%);
          width: 680px;
          height: 340px;
          background: radial-gradient(circle, var(--accent-glow) 0%, transparent 70%);
          filter: blur(60px);
          pointer-events: none;
          z-index: 0;
          animation: fp-drift 10s ease-in-out infinite;
        }
        .fp-hero-glow-b {
          position: absolute;
          top: 120px;
          left: 20%;
          width: 320px;
          height: 260px;
          background: radial-gradient(circle, rgba(37,99,235,0.14) 0%, transparent 70%);
          filter: blur(50px);
          pointer-events: none;
          z-index: 0;
        }
        .fp-grid-overlay {
          position: absolute;
          inset: 0;
          background-image: radial-gradient(var(--border) 1px, transparent 1px);
          background-size: 26px 26px;
          -webkit-mask-image: radial-gradient(ellipse 60% 50% at 50% 0%, #000 40%, transparent 100%);
          mask-image: radial-gradient(ellipse 60% 50% at 50% 0%, #000 40%, transparent 100%);
          opacity: 0.5;
          pointer-events: none;
          z-index: 0;
        }

        .fp-eyebrow {
          display: inline-block;
          font-size: 0.75rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--accent);
          margin-bottom: 0.75rem;
        }
        .fp-h2 {
          font-family: 'Space Grotesk', sans-serif;
          font-size: clamp(1.8rem, 3.5vw, 2.6rem);
          font-weight: 700;
          letter-spacing: -0.03em;
          margin: 0;
        }

        .landing-link {
          color: var(--muted);
          text-decoration: none;
          font-size: 0.88rem;
          font-weight: 500;
          transition: color 0.15s ease;
        }
        .landing-link:hover { color: var(--text); }

        .landing-signin-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background-color: var(--accent);
          color: #ffffff;
          border: none;
          padding: 0.55rem 1.15rem;
          border-radius: 8px;
          font-size: 0.85rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          box-shadow: 0 2px 8px var(--accent-glow);
        }
        .landing-signin-btn:hover {
          background-color: var(--accent-2);
          transform: translateY(-1px);
        }

        .hero-primary-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background-color: var(--accent);
          color: #ffffff;
          border: none;
          padding: 0.85rem 1.8rem;
          border-radius: 10px;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
          box-shadow: 0 4px 18px var(--accent-glow);
        }
        .hero-primary-btn:hover {
          background-color: var(--accent-2);
          transform: translateY(-2px);
          box-shadow: 0 8px 28px var(--accent-glow);
        }

        .hero-secondary-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background-color: var(--panel);
          color: var(--text);
          border: 1px solid var(--border);
          padding: 0.85rem 1.6rem;
          border-radius: 10px;
          font-size: 1rem;
          font-weight: 500;
          text-decoration: none;
          transition: all 0.2s ease;
        }
        .hero-secondary-btn:hover {
          background-color: var(--panel-2);
          border-color: var(--muted);
          transform: translateY(-1px);
        }

        .fp-theme-toggle:hover {
          background-color: var(--panel-3);
          border-color: var(--muted);
        }

        .fp-stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 1rem;
          max-width: 980px;
          margin: 0 auto;
        }
        .fp-stat-card {
          display: flex;
          align-items: center;
          gap: 12px;
          background-color: var(--panel);
          border: 1px solid var(--border);
          border-radius: 14px;
          padding: 1.1rem 1.25rem;
          transition: all 0.25s ease;
        }
        .fp-stat-card:hover {
          border-color: var(--accent);
          transform: translateY(-2px);
          box-shadow: 0 10px 26px -12px var(--accent-glow);
        }
        .fp-stat-icon {
          width: 38px;
          height: 38px;
          border-radius: 10px;
          background-color: var(--accent-soft);
          color: var(--accent);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .fp-stat-value {
          font-family: 'Space Grotesk', sans-serif;
          font-size: 1.25rem;
          font-weight: 700;
          color: var(--text);
          line-height: 1.2;
        }
        .fp-stat-label {
          font-size: 0.75rem;
          color: var(--muted);
        }

        .fp-metric-card {
          background-color: var(--panel-2);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 1.25rem;
        }
        .fp-ocr-grid {
          display: grid;
          grid-template-columns: 1fr 1.2fr;
          gap: 1.25rem;
        }

        .landing-feature-card {
          background-color: var(--panel);
          border: 1px solid var(--border);
          border-radius: 14px;
          padding: 1.75rem;
          transition: all 0.25s ease;
          height: 100%;
        }
        .landing-feature-card:hover {
          border-color: var(--accent);
          box-shadow: 0 8px 24px var(--accent-glow);
          transform: translateY(-3px);
        }

        .fp-step-card {
          background-color: var(--panel);
          border: 1px solid var(--border);
          border-radius: 14px;
          padding: 2rem;
          position: relative;
          height: 100%;
          transition: all 0.25s ease;
        }
        .fp-step-card:hover {
          border-color: var(--accent);
          transform: translateY(-3px);
        }
        .fp-step-number {
          font-size: 2.5rem;
          font-family: 'IBM Plex Mono', monospace;
          font-weight: 700;
          color: var(--accent);
          opacity: 0.35;
          margin-bottom: 0.75rem;
        }
        .fp-step-arrow {
          position: absolute;
          top: 2rem;
          right: -2.4rem;
          color: var(--border);
        }

        .fp-testimonial-card {
          background-color: var(--panel);
          border: 1px solid var(--border);
          border-radius: 14px;
          padding: 1.75rem;
          height: 100%;
          transition: all 0.25s ease;
        }
        .fp-testimonial-card:hover {
          border-color: var(--accent);
          transform: translateY(-3px);
          box-shadow: var(--shadow-lift);
        }

        .fp-pricing-card {
          background-color: var(--panel);
          border: 1px solid var(--border);
          border-radius: 16px;
          padding: 1.75rem;
          height: 100%;
          position: relative;
          transition: all 0.25s ease;
        }
        .fp-pricing-card:hover {
          transform: translateY(-4px);
          box-shadow: var(--shadow-lift);
        }
        .fp-pricing-highlighted {
          background: linear-gradient(160deg, var(--accent) 0%, var(--accent-2) 100%);
          border-color: transparent;
          color: #fff;
          box-shadow: 0 20px 50px -18px var(--accent-glow);
        }
        .fp-pricing-badge {
          position: absolute;
          top: -12px;
          right: 1.5rem;
          background-color: #fff;
          color: var(--accent-2);
          font-size: 0.7rem;
          font-weight: 700;
          padding: 4px 10px;
          border-radius: 999px;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .fp-pricing-btn {
          width: 100%;
          padding: 0.75rem 1rem;
          border-radius: 8px;
          border: 1px solid var(--border);
          background-color: var(--panel-2);
          color: var(--text);
          font-weight: 600;
          font-size: 0.88rem;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .fp-pricing-btn:hover { background-color: var(--panel-3); }
        .fp-pricing-btn-light {
          background-color: #fff;
          color: var(--accent-2);
          border-color: transparent;
        }
        .fp-pricing-btn-light:hover { background-color: rgba(255,255,255,0.9); }

        .fp-arch-panel {
          background-color: var(--panel);
          border: 1px solid var(--border);
          border-radius: 16px;
          padding: 2.5rem;
        }
        .fp-tech-chip {
          padding: 6px 14px;
          border-radius: 999px;
          background-color: var(--panel-2);
          border: 1px solid var(--border);
          font-size: 0.82rem;
          font-weight: 500;
          color: var(--text);
          transition: all 0.2s ease;
        }
        .fp-tech-chip:hover {
          border-color: var(--accent);
          color: var(--accent);
          transform: translateY(-2px);
        }

        .fp-cta-section {
          background-color: var(--panel);
          border-top: 1px solid var(--border);
          padding: 5.5rem 1.5rem;
          text-align: center;
          position: relative;
          overflow: hidden;
        }
        .fp-cta-glow {
          position: absolute;
          bottom: -140px;
          left: 50%;
          transform: translateX(-50%);
          width: 700px;
          height: 320px;
          background: radial-gradient(circle, var(--accent-glow) 0%, transparent 70%);
          filter: blur(60px);
          pointer-events: none;
        }

        .fp-social-btn {
          width: 34px;
          height: 34px;
          border-radius: 8px;
          border: 1px solid var(--border);
          background-color: var(--panel);
          color: var(--muted);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          text-decoration: none;
          transition: all 0.2s ease;
        }
        .fp-social-btn:hover {
          color: var(--accent);
          border-color: var(--accent);
          transform: translateY(-2px);
        }

        .fp-footer-grid {
          display: grid;
          grid-template-columns: 1.4fr repeat(4, 1fr);
          gap: 2rem;
        }

        /* Auth page */
        .fp-auth-brand {
          background: linear-gradient(155deg, var(--accent) 0%, var(--accent-2) 100%);
          padding: 3.5rem 3.5rem;
          display: flex;
          flex-direction: column;
          justify-content: center;
          position: relative;
          overflow: hidden;
        }
        .fp-auth-form-wrap {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 2.5rem 2rem;
        }
        .fp-back-link {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: none;
          border: none;
          color: var(--muted);
          cursor: pointer;
          font-size: 0.85rem;
          font-weight: 500;
          padding: 0;
        }
        .fp-back-link:hover { color: var(--text); }
        .fp-input-wrap {
          display: flex;
          align-items: center;
          gap: 10px;
          border: 1px solid var(--border);
          background-color: var(--panel-2);
          border-radius: 10px;
          padding: 0.7rem 0.9rem;
          transition: all 0.2s ease;
        }
        .fp-input-wrap:focus-within {
          border-color: var(--accent);
          box-shadow: 0 0 0 3px var(--accent-soft);
        }
        .fp-input-wrap input {
          border: none;
          outline: none;
          background: transparent;
          color: var(--text);
          font-size: 0.9rem;
          width: 100%;
          font-family: inherit;
        }
        .fp-input-wrap input::placeholder { color: var(--muted); }

        .fp-mobile-drawer { animation: fp-fade-up 0.25s ease both; }

        @media (max-width: 900px) {
          .fp-footer-grid { grid-template-columns: repeat(2, 1fr); }
          .fp-auth-shell { grid-template-columns: 1fr !important; }
          .fp-auth-brand { display: none !important; }
        }
        @media (max-width: 768px) {
          .landing-nav-links { display: none !important; }
          .fp-btn-desktop-only { display: none !important; }
          .fp-mobile-menu-btn { display: inline-flex !important; }
          .fp-hide-on-small { display: none !important; }
          .fp-ocr-grid { grid-template-columns: 1fr !important; }
          .fp-step-arrow { display: none !important; }
        }
        @media (max-width: 560px) {
          .fp-footer-grid { grid-template-columns: 1fr; }
        }
      `}</style>
  );
}

export default LandingPage;
