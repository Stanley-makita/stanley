'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function Home() {
  const router = useRouter()

  useEffect(() => {
    const hash = window.location.hash
    if (hash.includes('type=recovery')) {
      router.replace('/redefinir-senha' + hash)
    } else {
      router.replace('/dashboard')
    }
  }, [router])

  return null
}
