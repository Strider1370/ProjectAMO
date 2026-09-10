import { Button, Body1, MessageBar, MessageBarBody, Spinner, makeStyles, tokens } from '../../shared/ui/fluent.js'

const useStyles = makeStyles({
  content: { display: 'flex', flexDirection: 'column', gap: tokens.spacingVerticalM, padding: tokens.spacingVerticalL },
  actions: { display: 'flex', gap: tokens.spacingHorizontalS },
})

// Only the pending/error state lives here. Successful results use BriefingView.
export default function OrganizationBriefingStatus({ loading, error, onRetry, onBack }) {
  const styles = useStyles()
  return <section className="route-check-panel" aria-label="기상 브리핑 불러오기">
    <div className="route-check-header"><h2 className="route-check-title">기상 브리핑</h2></div>
    <div className={styles.content}>
      {loading ? <Spinner label="기상 브리핑을 불러오는 중…" /> : error
        ? <MessageBar intent="error"><MessageBarBody>기상 브리핑을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</MessageBarBody></MessageBar>
        : <Body1>기상 브리핑을 준비하고 있습니다.</Body1>}
      <div className={styles.actions}>
        {error && <Button appearance="primary" disabled={loading} onClick={() => onRetry()}>다시 시도</Button>}
        <Button onClick={onBack}>기관 비행으로 돌아가기</Button>
      </div>
    </div>
  </section>
}
