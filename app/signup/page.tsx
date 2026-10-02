import SignupForm from './signup-form'

type Props = { searchParams: Promise<{ code?: string }> }

export default async function SignupPage({ searchParams }: Props) {
  // URL に ?code=XXXX-XXXX を付けるとコード入力済みで開ける（案内リンク用）
  const { code } = await searchParams

  return (
    <div className="flex items-center justify-center min-h-[80vh] p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm p-8">
        <SignupForm initialCode={(code ?? '').toUpperCase()} />
      </div>
    </div>
  )
}
