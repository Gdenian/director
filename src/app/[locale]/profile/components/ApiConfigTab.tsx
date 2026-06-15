'use client'

import { CreativeEngineTabContainer } from './creative-engine/CreativeEngineTabContainer'

interface ApiConfigTabProps {
  view?: 'engines' | 'models'
  onOpenModelSelection?: () => void
}

export default function ApiConfigTab({ view = 'engines', onOpenModelSelection }: ApiConfigTabProps) {
  return <CreativeEngineTabContainer view={view} onOpenModelSelection={onOpenModelSelection} />
}
