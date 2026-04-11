import { useEffect, useState } from 'react'
import { Button, Dialog, DialogActions, DialogContent, Typography } from '@mui/material'
import { useTheme } from '@mui/material/styles'

export default function ClearCartModal({ open, onClose, onConfirm }) {
  const theme = useTheme()
  const { brand } = theme
  const [isClearing, setIsClearing] = useState(false)

  useEffect(() => {
    if (!open) setIsClearing(false)
  }, [open])

  const handleClose = () => {
    if (isClearing) return
    onClose()
  }

  const handleConfirm = async () => {
    setIsClearing(true)
    try {
      await onConfirm()
      onClose()
    } finally {
      setIsClearing(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      aria-labelledby="clear-cart-title"
      BackdropProps={{
        sx: {
          backgroundColor: 'rgba(0,0,0,0.18)',
        },
      }}
      PaperProps={{
        sx: {
          width: '100%',
          maxWidth: '260px',
          mx: 2,
          p: '24px',
          borderRadius: '14px',
          border: `0.5px solid ${brand.border}`,
          boxShadow: 'none',
          textAlign: 'center',
          backgroundColor: '#ffffff',
        },
      }}
    >
      <DialogContent sx={{ p: 0 }}>
        <Typography
          id="clear-cart-title"
          sx={{
            fontFamily: brand.fontBase,
            fontSize: '15px',
            fontWeight: 600,
            color: brand.textPrimary,
            lineHeight: 1.25,
          }}
        >
          Clear your cart?
        </Typography>
        <Typography
          sx={{
            mt: 0.75,
            fontFamily: brand.fontBase,
            fontSize: '12px',
            fontWeight: 500,
            color: brand.textSecondary,
            lineHeight: 1.4,
          }}
        >
          This can&apos;t be undone.
        </Typography>
      </DialogContent>

      <DialogActions sx={{ p: 0, pt: 2, gap: 1.25 }}>
        <Button
          fullWidth
          onClick={handleClose}
          disabled={isClearing}
          variant="outlined"
          sx={{
            minWidth: 0,
            flex: 1,
            borderRadius: '9px',
            border: `0.5px solid ${brand.border}`,
            backgroundColor: 'transparent',
            color: brand.textSecondary,
            fontFamily: brand.fontBase,
            fontSize: '13px',
            fontWeight: 500,
            textTransform: 'none',
            py: 0.95,
            '&:hover': {
              border: `0.5px solid ${brand.border}`,
              backgroundColor: 'transparent',
            },
          }}
        >
          Cancel
        </Button>
        <Button
          fullWidth
          onClick={handleConfirm}
          disabled={isClearing}
          variant="contained"
          sx={{
            minWidth: 0,
            flex: 1,
            borderRadius: '9px',
            border: 'none',
            boxShadow: 'none',
            backgroundColor: '#f5ebe9',
            color: '#a93226',
            fontFamily: brand.fontBase,
            fontSize: '13px',
            fontWeight: 600,
            textTransform: 'none',
            py: 0.95,
            '&:hover': {
              backgroundColor: '#f5ebe9',
              boxShadow: 'none',
            },
          }}
        >
          {isClearing ? 'Clearing…' : 'Clear'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
