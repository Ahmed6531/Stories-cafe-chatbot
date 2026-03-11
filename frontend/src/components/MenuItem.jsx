// migrated from menu-item.css
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { Box, Typography, styled } from '@mui/material';
import { menuCardLayout } from '../theme/layoutTokens';

const brand = {
  primary: '#00704a',
  primaryHover: '#147d56',
  primaryActive: '#004a34',
  primaryDark: '#1e5631',
  textPrimary: '#2b2b2b',
  textSecondary: '#79747e',
  border: '#e0e0e0',
  bgLight: '#f8f9f8',
  shadowSm: '0 0 6px rgba(0,0,0,0.06)',
  shadowMd: '0 2px 12px rgba(0,0,0,0.08)',
  shadowHover: '0 4px 12px rgba(0,0,0,0.15)',
  fontBase: "'Montserrat', sans-serif",
  fontDisplay: "'DIN Alternate Bold', 'Montserrat', sans-serif",
}

const ItemCard = styled(Box, {
  shouldForwardProp: (prop) => prop !== 'isAvailable',
})(({ theme, isAvailable }) => ({
  display: 'flex',
  flexDirection: 'column',
  backgroundColor: '#ffffff',
  borderRadius: '12px',
  overflow: 'hidden',
  cursor: isAvailable ? 'pointer' : 'default',
	  transition: 'all 0.3s cubic-bezier(0.23, 1, 0.32, 1)',
	  boxShadow: brand.shadowSm,
	  height: `${menuCardLayout.cardHeight.desktop}px`,
	  position: 'relative',
	  border: `1px solid ${brand.border}`,
	  opacity: isAvailable ? 1 : 0.7,

  ...(isAvailable && {
    '&:hover': {
      boxShadow: `${brand.shadowHover}, inset 0 0 0 1px rgba(26, 74, 53, 0.08)`,
      transform: 'translateY(-4px)',
      borderColor: 'rgba(26, 74, 53, 0.35)',
    },
    '&:hover img': {
      transform: 'scale(1.08)',
    }
  }),

	  [theme.breakpoints.down('md')]: { height: `${menuCardLayout.cardHeight.desktop}px` },
	  [theme.breakpoints.down('sm')]: { height: `${menuCardLayout.cardHeight.mobile}px`, borderRadius: '10px' }
	}));

const ItemCta = styled('button')(({ theme }) => ({
  position: 'absolute',
  top: '12px',
  right: '12px',
  zIndex: 3,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  // Glassmorphism effect to be less distracting
  background: 'rgba(255, 255, 255, 0.85)',
  backdropFilter: 'blur(4px)',
  border: `1px solid ${brand.border}`,
  borderRadius: '50%', 
  width: '32px',
  height: '32px',
  padding: 0,
  color: brand.primary,
  cursor: 'pointer',
  transition: 'all 0.25s ease',

  '&:hover:not(:disabled)': {
    backgroundColor: brand.primary,
    color: '#ffffff',
    borderColor: brand.primary,
    transform: 'scale(1.1)',
  },

  '&:disabled': {
    display: 'none', // Hide the magnifier if item is unavailable
  },

  [theme.breakpoints.down('sm')]: {
    width: '28px',
    height: '28px',
    top: '8px',
    right: '8px',
  }
}));

const ItemImageContainer = styled(Box)(({ theme }) => ({
	  position: 'relative',
	  width: '100%',
	  height: `${menuCardLayout.imageHeight.desktop}px`,
	  overflow: 'hidden',
	  backgroundColor: '#ffffff',
	  display: 'flex',
	  alignItems: 'center',
	  justifyContent: 'center',
	  [theme.breakpoints.down('sm')]: { height: `${menuCardLayout.imageHeight.mobile}px` }
	}));

const ItemImage = styled('img')(() => ({
  width: '100%',
  height: '100%',
  objectFit: 'contain',
  padding: '12px',
  transition: 'transform 0.5s cubic-bezier(0.33, 1, 0.68, 1)',
  backgroundColor: '#ffffff',
}));

const ImgPlaceholder = styled(Box)(() => ({
  width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
  alignItems: 'center', justifyContent: 'center', gap: '6px', color: '#b0b8be',
}));

const ItemContent = styled(Box)(({ theme }) => ({
	  display: 'flex',
	  flexDirection: 'column',
	  padding: `${menuCardLayout.contentPadding.desktop}px`,
	  flex: 1,
	  gap: '4px',
	  background: brand.bgLight,
	  [theme.breakpoints.down('sm')]: { padding: `${menuCardLayout.contentPadding.mobile}px` }
	}));

const ItemName = styled(Typography)(({ theme }) => ({
  fontFamily: brand.fontDisplay,
  fontSize: '15px',
  fontWeight: 600,
  color: brand.textPrimary,
  lineHeight: 1.2,
  [theme.breakpoints.down('sm')]: { fontSize: '12px' }
}));

const ItemDescription = styled(Typography)(({ theme }) => ({
  fontFamily: brand.fontBase,
  fontSize: '12px',
  color: brand.textSecondary,
  lineHeight: 1.4,
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  minHeight: '2.8em',
  [theme.breakpoints.down('sm')]: {
    WebkitLineClamp: 1,
    minHeight: '1.4em',
  },
}));

const ItemBottom = styled(Box)(() => ({
  marginTop: 'auto',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '8px',
}));

const StatusPill = styled(Box, {
  shouldForwardProp: (prop) => prop !== 'isAvailable',
})(({ theme, isAvailable }) => ({
  padding: '4px 10px',
  borderRadius: '20px',
  fontWeight: 600,
  fontSize: '11px',
  background: isAvailable ? '#edf3ef' : '#fee2e2',
  color: isAvailable ? '#5b6b62' : '#b91c1c',
  [theme.breakpoints.down('sm')]: {
    fontSize: '9px',
    padding: '2px 7px',
  },
}));

const ItemPrice = styled(Typography)(({ theme }) => ({
  fontFamily: brand.fontBase,
  fontSize: '17px',
  fontWeight: 700,
  color: brand.textPrimary,
  [theme.breakpoints.down('sm')]: { fontSize: '14px' }
}));

export default function MenuItem({ item }) {
  const navigate = useNavigate();
  const [imageError, setImageError] = useState(false);
  const showPlaceholder = !item.hasImage || imageError;

  const formatPrice = (p) => (
    <>
      <Box component="span" sx={{ fontSize: '0.72em', fontWeight: 600, opacity: 0.7 }}>LL</Box> {Number(p).toLocaleString()}
    </>
  );

  const handleAction = (e) => {
    if (e) e.stopPropagation();
    if (item.isAvailable) navigate(`/item/${item.id}`);
  };

  return (
    <ItemCard
      isAvailable={item.isAvailable}
      onClick={handleAction}
      onKeyDown={(e) => e.key === 'Enter' && handleAction()}
      tabIndex={item.isAvailable ? 0 : -1}
    >
      {/* MAGNIFIER CTA */}
      <ItemCta 
        disabled={!item.isAvailable} 
        onClick={handleAction}
        aria-label="View Details"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
      </ItemCta>

      <ItemImageContainer>
        {showPlaceholder ? (
          <ImgPlaceholder>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="m21 15-5-5L5 21" />
            </svg>
          </ImgPlaceholder>
        ) : (
          <ItemImage src={item.image} alt={item.name} onError={() => setImageError(true)} />
        )}
      </ItemImageContainer>

      <ItemContent>
        <ItemName>{item.name}</ItemName>
        <ItemDescription>{item.description}</ItemDescription>
        <ItemBottom>
          <StatusPill isAvailable={item.isAvailable}>
            {item.isAvailable ? 'Available' : 'Out of stock'}
          </StatusPill>
          <ItemPrice>{formatPrice(item.basePrice)}</ItemPrice>
        </ItemBottom>
      </ItemContent>
    </ItemCard>
  );
}
