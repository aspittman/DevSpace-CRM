export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm border">
        <h1 className="text-2xl font-bold mb-2">Sign in</h1>
        <p className="text-sm text-slate-600 mb-6">
          Log in to access DevSpace CRM.
        </p>

        <form className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input
              type="email"
              className="w-full rounded-xl border px-3 py-2"
              placeholder="you@devspacetechnologies.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Password</label>
            <input
              type="password"
              className="w-full rounded-xl border px-3 py-2"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-xl bg-slate-900 text-white py-2"
          >
            Sign in
          </button>
        </form>
      </div>
    </div>
  )
}