import OperationalPreview from './OperationalPreview.jsx'
import VerticalProfileConcept from './VerticalProfileConcept.jsx'
export default function PreviewEntry() {
  return new URLSearchParams(window.location.search).get('demo') === '1' ? <VerticalProfileConcept/> : <OperationalPreview/>
}
