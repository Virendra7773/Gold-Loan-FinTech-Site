import { useState, type FormEvent } from 'react';
import { motion } from 'motion/react';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  KeyRound,
  Landmark,
  ShieldCheck,
  UserPlus,
} from 'lucide-react';
import type { StaffRole, StaffUser } from '../types/portal.ts';
import { portalApi } from '../services/api.ts';

interface HomeAuthViewProps {
  staffDirectory: StaffUser[];
  roleLabels: Record<StaffRole, string>;
  onAuthenticated: (user: StaffUser, updatedDirectory?: StaffUser[]) => void;
}

type AuthMode = 'signin' | 'register';

export function HomeAuthView({
  staffDirectory,
  roleLabels,
  onAuthenticated,
}: HomeAuthViewProps) {
  const [mode, setMode] = useState<AuthMode>('signin');
  const [selectedPresetId, setSelectedPresetId] = useState<string>(
    staffDirectory[0]?.id ?? 'staff-01'
  );

  // Sign In Form State
  const [loginId, setLoginId] = useState<string>(
    staffDirectory[0]?.demoCredentials?.loginId ?? 'priya.staff@aurelia.in'
  );
  const [password, setPassword] = useState<string>(
    staffDirectory[0]?.demoCredentials?.password ?? 'Staff@2026'
  );
  const [showSignInPass, setShowSignInPass] = useState(false);

  // Registration Form State
  const [regName, setRegName] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regLoginId, setRegLoginId] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [showRegPass, setShowRegPass] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function selectPredefinedAccount(user: StaffUser) {
    setMode('signin');
    setSelectedPresetId(user.id);
    setLoginId(user.demoCredentials?.loginId ?? user.employeeCode);
    setPassword(user.demoCredentials?.password ?? '');
    setError(null);
  }

  async function handleSignIn(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await portalApi.loginRole({
        loginId,
        password,
      });
      onAuthenticated(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in with these credentials.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRegister(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await portalApi.registerCustomer({
        fullName: regName,
        phone: regPhone,
        loginId: regLoginId,
        password: regPassword,
      });
      onAuthenticated(res.user, res.staffDirectory);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create customer account.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col text-slate-900">
      {/* Strict 3-Zone Top Bar */}
      <header className="h-16 bg-white/90 backdrop-blur-md border-b border-slate-200/80 px-6 flex items-center justify-between gap-8 sticky top-0 z-20">
        <span className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0">
          Aurelia Vault
        </span>

        <nav className="hidden md:flex items-center gap-6 text-xs font-medium text-slate-600">
          <a
            href="#roles"
            className="hover:text-slate-900 hover:underline underline-offset-4 whitespace-nowrap shrink-0"
          >
            Role Directory
          </a>
          <a
            href="#safeguards"
            className="hover:text-slate-900 hover:underline underline-offset-4 whitespace-nowrap shrink-0"
          >
            Vault Safeguards
          </a>
          <button
            type="button"
            onClick={() => {
              setMode('register');
              setError(null);
            }}
            className="hover:text-slate-900 hover:underline underline-offset-4 whitespace-nowrap shrink-0 cursor-pointer"
          >
            New Borrower
          </button>
        </nav>

        <div className="shrink-0">
          <button
            type="button"
            onClick={() => {
              setMode(mode === 'signin' ? 'register' : 'signin');
              setError(null);
            }}
            className="btn-bullion inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
          >
            {mode === 'signin' ? (
              <>
                <UserPlus className="w-3.5 h-3.5" />
                <span>Create Account</span>
              </>
            ) : (
              <>
                <KeyRound className="w-3.5 h-3.5" />
                <span>Member Sign In</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* Main Centered 2-Column Entry Split */}
      <main className="flex-1 max-w-[1280px] w-full mx-auto px-6 py-8 lg:py-12 flex items-center">
        <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          {/* Left Column: Deep Obsidian Institutional Overview & Predefined Role Credentials */}
          <motion.section
            id="roles"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="lg:col-span-7 bg-[#0B111E] text-slate-100 rounded-xl p-7 lg:p-8 border border-slate-800 flex flex-col justify-between gap-6"
          >
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#D4A94B] to-[#9A6B16] flex items-center justify-center shrink-0">
                  <Landmark className="w-4 h-4 text-slate-950" aria-hidden="true" />
                </div>
                <span className="text-xs text-slate-400">
                  Mumbai Bandra West · Branch MUM-04
                </span>
              </div>

              <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-white max-w-xl">
                Gold-Backed Lending &amp; Collateral Custody Portal
              </h1>

              <p className="text-sm text-slate-300 leading-relaxed max-w-xl">
                Sign in with a predefined staff or borrower account, or register a new customer portal profile. Supports billed ornaments and declared ancestral generational gold.
              </p>
            </div>

            {/* Clickable Predefined Role Accounts */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-medium text-slate-200">
                  Predefined Demo Accounts (Click to Pre-Fill Sign In)
                </span>
                <span className="font-mono tabular-nums">
                  {staffDirectory.length} account(s)
                </span>
              </div>

              <div className="divide-y divide-slate-800 border border-slate-800 rounded-lg overflow-hidden bg-[#070B14]">
                {staffDirectory.map((user) => {
                  const isSelected = mode === 'signin' && selectedPresetId === user.id;
                  return (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() => selectPredefinedAccount(user)}
                      className={`w-full px-4 py-3 text-left flex flex-wrap items-center justify-between gap-3 transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-[#C5963A]/15 text-white'
                          : 'hover:bg-white/5 text-slate-300'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-xs font-semibold text-white">
                          <span>{roleLabels[user.role]}</span>
                          <span aria-hidden="true" className="text-slate-500">·</span>
                          <span className="text-slate-300 font-normal">{user.name}</span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {user.designation} · {user.employeeCode}
                        </div>
                      </div>

                      <div className="flex items-center gap-3 text-[11px] font-mono tabular-nums shrink-0">
                        <div className="text-right">
                          <div className="text-[#E6BF6F]">
                            {user.demoCredentials?.loginId ?? user.employeeCode}
                          </div>
                          <div className="text-slate-400">
                            Pass: {user.demoCredentials?.password ?? '••••••'}
                          </div>
                        </div>
                        {isSelected && <Check className="w-4 h-4 text-[#E6BF6F]" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div
              id="safeguards"
              className="pt-4 border-t border-slate-800/80 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400"
            >
              <span className="inline-flex items-center gap-1.5 text-slate-300">
                <ShieldCheck className="w-3.5 h-3.5 text-[#D4A94B]" />
                <span>AES-256-GCM Encrypted KYC &amp; Bank Fields</span>
              </span>
              <span aria-hidden="true">·</span>
              <span>Masked Aadhaar Storage</span>
              <span aria-hidden="true">·</span>
              <span>Tamper-Evident Audit Trail</span>
            </div>
          </motion.section>

          {/* Right Column: Clean Sign-In / Create Customer Account Card */}
          <motion.section
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
            className="lg:col-span-5 vault-card rounded-xl p-6 sm:p-8 flex flex-col justify-between gap-6"
          >
            <div className="space-y-6">
              {/* Segmented Sign In / Create Account Switcher */}
              <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg">
                <button
                  type="button"
                  onClick={() => {
                    setMode('signin');
                    setError(null);
                  }}
                  className={`py-2 px-3 text-xs font-medium rounded-md transition-all whitespace-nowrap cursor-pointer ${
                    mode === 'signin'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('register');
                    setError(null);
                  }}
                  className={`py-2 px-3 text-xs font-medium rounded-md transition-all whitespace-nowrap cursor-pointer ${
                    mode === 'register'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Create Customer Account
                </button>
              </div>

              {mode === 'signin' ? (
                <form onSubmit={handleSignIn} className="space-y-4">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">
                      Sign In to Aurelia Vault
                    </h2>
                    <p className="text-xs text-slate-500 mt-1">
                      Enter your predefined role ID &amp; password or your registered customer account credentials.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Login ID / Email / Employee Code
                    </label>
                    <input
                      type="text"
                      required
                      value={loginId}
                      onChange={(e) => setLoginId(e.target.value)}
                      placeholder="e.g., priya.staff@aurelia.in"
                      className="w-full px-3 py-2.5 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:border-[#B47B1B]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Password
                    </label>
                    <div className="relative">
                      <input
                        type={showSignInPass ? 'text' : 'password'}
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter password"
                        className="w-full pl-3 pr-10 py-2.5 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:border-[#B47B1B]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowSignInPass((v) => !v)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
                        aria-label={showSignInPass ? 'Hide password' : 'Show password'}
                      >
                        {showSignInPass ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  {error && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-red-700" />
                      <span>{error}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="btn-bullion w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-medium rounded-lg disabled:opacity-50 cursor-pointer"
                  >
                    <span>{submitting ? 'Signing In...' : 'Sign In & Open Workspace'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </form>
              ) : (
                <form onSubmit={handleRegister} className="space-y-4">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">
                      Create New Customer Account
                    </h2>
                    <p className="text-xs text-slate-500 mt-1">
                      Register for the Borrower Self-Service Portal to track applications, sign sanction letters, and view EMI receipts.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Full Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={regName}
                      onChange={(e) => setRegName(e.target.value)}
                      placeholder="e.g., Rohan Rajesh Deshmukh"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-[#B47B1B]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Mobile Number *
                    </label>
                    <input
                      type="tel"
                      required
                      value={regPhone}
                      onChange={(e) => setRegPhone(e.target.value)}
                      placeholder="+91 98200 12345"
                      className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:border-[#B47B1B]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Email / Login ID *
                    </label>
                    <input
                      type="text"
                      required
                      value={regLoginId}
                      onChange={(e) => setRegLoginId(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:border-[#B47B1B]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Password (min 6 characters) *
                    </label>
                    <div className="relative">
                      <input
                        type={showRegPass ? 'text' : 'password'}
                        required
                        minLength={6}
                        value={regPassword}
                        onChange={(e) => setRegPassword(e.target.value)}
                        placeholder="Create a password"
                        className="w-full pl-3 pr-10 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:border-[#B47B1B]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowRegPass((v) => !v)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
                        aria-label={showRegPass ? 'Hide password' : 'Show password'}
                      >
                        {showRegPass ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  {error && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-red-700" />
                      <span>{error}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="btn-bullion w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-medium rounded-lg disabled:opacity-50 cursor-pointer"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>
                      {submitting ? 'Creating Account...' : 'Create Account & Sign In'}
                    </span>
                  </button>
                </form>
              )}
            </div>

            <div className="pt-4 border-t border-slate-200/80 text-[11px] text-slate-500">
              {mode === 'signin'
                ? 'Need a borrower portal login? Switch to Create Customer Account above to register immediately.'
                : 'Your new account is saved in the portal directory and can be used anytime from the Sign In tab.'}
            </div>
          </motion.section>
        </div>
      </main>
    </div>
  );
}
