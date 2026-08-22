import { CSSProperties } from 'react';

export const inputStyle: CSSProperties = {
  width: '100%',
  padding: 8,
  boxSizing: 'border-box',
  border: '1px solid #d1d5db',
  borderRadius: 6,
};

export const buttonStyle: CSSProperties = {
  padding: '8px 14px',
  borderRadius: 6,
  border: 'none',
  backgroundColor: '#1D9E75',
  color: '#ffffff',
  fontWeight: 600,
  cursor: 'pointer',
};

export const dangerButtonStyle: CSSProperties = {
  ...buttonStyle,
  backgroundColor: '#dc2626',
};

export const secondaryButtonStyle: CSSProperties = {
  ...buttonStyle,
  backgroundColor: '#ffffff',
  color: '#1a1a1a',
  border: '1px solid #d1d5db',
};

export const cellStyle: CSSProperties = {
  textAlign: 'left',
  padding: '8px 12px',
  borderBottom: '1px solid #e5e5e5',
};

export const cardStyle: CSSProperties = {
  border: '1px solid #e5e5e5',
  borderRadius: 8,
  padding: 16,
};
