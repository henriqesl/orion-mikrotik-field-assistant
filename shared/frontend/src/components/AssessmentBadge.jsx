function AssessmentBadge({ assessment }) {
  return (
    <span
      aria-label={`${assessment.label}. ${assessment.explanation}`}
      className={`assessment-badge assessment-badge--${assessment.status}`}
      title={assessment.explanation}
    >
      {assessment.label}
    </span>
  );
}

export default AssessmentBadge;

