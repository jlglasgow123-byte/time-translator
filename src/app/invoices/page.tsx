import { ExportReviewView } from '@/components/export/ExportReviewView'

export default function InvoicesPage() {
  return (
    <ExportReviewView
      eyebrow="Outputs"
      title="Invoices"
      description="Turn reviewed calendar time into invoice-ready rows. Edit any field, bulk-update rows, then export to CSV."
    />
  )
}
