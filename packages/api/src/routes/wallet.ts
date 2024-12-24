import { createElysia } from '../utils'
import { t } from 'elysia'
import { zerion } from '../services/zerion'

export const walletRoutes = createElysia({ prefix: '/wallet' }).get(
  '/:address/fungibles',
  async ({ params }) => {
    const data = await zerion.getFungiblePositions(params.address)
    return { data }
  },
  {
    params: t.Object({
      address: t.String(),
    }),
  }
)
