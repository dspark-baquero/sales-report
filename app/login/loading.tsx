export default function LoginLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm rounded-lg border bg-white p-8 shadow-sm animate-pulse">
        <div className="mx-auto mb-4 h-6 w-48 rounded bg-gray-200" />
        <div className="mx-auto mb-6 h-4 w-56 rounded bg-gray-200" />
        <div className="h-10 w-full rounded bg-gray-200" />
      </div>
    </div>
  );
}
