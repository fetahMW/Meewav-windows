import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

function InteractiveSmokeTest() {
  const [ready, setReady] = useState(false)

  return (
    <button type="button" onClick={() => setReady(true)}>
      {ready ? 'Harnais prêt' : 'Vérifier le harnais'}
    </button>
  )
}

describe('quality harness', () => {
  it('renders React and handles a user interaction in jsdom', async () => {
    const user = userEvent.setup()

    render(<InteractiveSmokeTest />)
    await user.click(
      screen.getByRole('button', { name: 'Vérifier le harnais' }),
    )

    expect(
      screen.getByRole('button', { name: 'Harnais prêt' }),
    ).toBeVisible()
  })
})
