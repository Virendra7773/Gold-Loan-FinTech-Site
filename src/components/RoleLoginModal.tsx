import { useEffect, useState, type FormEvent } from 'react';
import { motion } from 'motion/react';
import { AlertTriangle, Eye, EyeOff, KeyRound, Lock, ShieldCheck, X } from 'lucide-react';
import type { StaffRole, StaffUser } from '../types/portal.ts';
import { portalApi } from '../services/api.ts';

interface RoleLoginModalProps {
  targetStaffId: string;
  staffDirectory: StaffUser[];
  roleLabels: Record<StaffRole, string>;
  onClose: () => void;
  onAuthenticated: (user: StaffUser) => void;
}

export function RoleLoginModal({
  targetStaffId,
  staffDirectory,
  roleLabels,
  onClose,
  onAuthenticated,
}: RoleLoginModalProps) {
  const [selectedId, setSelectedId] = useState(targetStaffId);
  const selectedUser = staffDirectory.find((s) => s.id === selectedId) ?? staffDirectory[0];

  const [loginId, setLoginId] = useState(selectedUser?.demoCredentials?.loginId ?? '');
  const [password, setPassword] = useState(selectedUser?.demoCredentials?.password ?? '');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSelectedId(targetStaffId);
  }, [targetStaffId]);

  useEffect(() => {
    if (!selectedUser) return;
    setLoginId(selectedUser.demoCredentials?.loginId ?? selectedUser.employeeCode);
    setPassword(selectedUser.demoCredentials?.password ?? '');
    setError(null);
  }, [selectedUser]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!selectedUser) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await portalApi.loginRole({
        staffId: selectedUser.id,
        loginId,
        password,
      });
      onAuthenticated(res.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to verify role credentials.');
    } finally {
      setSubmitting(false);
    }
  }

  function restoreDemoCredentials() {
    if (!selectedUser?.demoCredentials) return;
    setLoginId(selectedUser.demoCredentials.loginId);
    setPassword(selectedUser.demoCredentials.password);
    setError(null);
  }

  if (!selectedUser) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4 no-print"
      role="dialog"
      aria-modal="true"
      aria-labelledby="role-login-heading"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.98, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-md bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden"
      >
        {/* Obsidian Modal Header */}
        <div className="bg-[#0B111E] text-white px-6 py-4 flex items-center justify-between gap-4 border-b border-slate-800">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#D4A94B] to-[#9A6B16] flex items-center justify-center shrink-0">
              <Lock className="w-4 h-4 text-slate-950" />
            </div>
            <div className="min-w-0">
              <h2 id="role-login-heading" className="text-sm font-semibold text-white truncate">
                Role Access Sign In
              </h2>
              <p className="text-[11px] text-slate-400 truncate">
                {roleLabels[selectedUser.role]} · {selectedUser.employeeCode}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer"
            aria-label="Close sign in dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="p-3 bg-amber-50/75 border border-amber-200 rounded-lg text-xs text-amber-950 flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-[#9A6B16] shrink-0 mt-0.5" />
            <div>
              <span className="font-medium">Demo Credentials Pre-Filled:</span> Saved system Login ID and password are loaded below. Click <strong className="text-slate-900">Sign In &amp; Switch Role</strong> to authenticate.
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Target Role Perspective
            </label>
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-[#B47B1B]"
            >
              {staffDirectory.map((user) => (
                <option key={user.id} value={user.id}>
                  {roleLabels[user.role]} — {user.name} ({user.employeeCode})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Login ID / Employee Code
            </label>
            <input
              type="text"
              required
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              placeholder="Enter Login ID or Employee Code"
              className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:border-[#B47B1B]"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-slate-700">
                Password
              </label>
              <button
                type="button"
                onClick={restoreDemoCredentials}
                className="text-[11px] font-medium text-[#9A6B16] hover:underline cursor-pointer"
              >
                Use Saved Demo Password
              </button>
            </div>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter role password"
                className="w-full pl-3 pr-10 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:border-[#B47B1B]"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-red-700" />
              <span>{error}</span>
            </div>
          )}

          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="btn-bullion inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg disabled:opacity-50 whitespace-nowrap cursor-pointer"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>{submitting ? 'Verifying...' : 'Sign In & Switch Role'}</span>
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
