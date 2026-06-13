import { getClients } from '@/actions/clients'
import { ClientCard } from '@/components/clients/ClientCard'
import { CreateClientButton } from '@/components/clients/CreateClientButton'

export default async function ClientsPage() {
  const clients = await getClients()
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Clients</h1>
        <CreateClientButton />
      </div>
      {clients.length === 0 ? (
        <p className="text-muted text-center py-12">No clients yet. Add your first client.</p>
      ) : (
        <div className="space-y-3">
          {clients.map((c) => <ClientCard key={c.id} client={c} />)}
        </div>
      )}
    </div>
  )
}
