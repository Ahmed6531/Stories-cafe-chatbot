import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Stack,
} from '@mui/material'
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded'
import DeleteSweepOutlinedIcon from '@mui/icons-material/DeleteSweepOutlined'

const brand = {
  primaryDark: '#1e5631',
  textPrimary: '#2b2b2b',
  textSecondary: '#79747e',
  fontBase: "'Montserrat', sans-serif",
}

export default function ClearCartModal({ open, onClose, onConfirm, itemCount = 0 }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      aria-labelledby="clear-cart-title"
      PaperProps={{
        sx: {
          borderRadius: '16px',
          fontFamily: brand.fontBase,
          maxWidth: 420,
          width: '100%',
          mx: 2,
        },
      }}
    >
      <DialogTitle
        id="clear-cart-title"
        sx={{ fontFamily: brand.fontBase, fontWeight: 900, fontSize: '1.1rem', pb: 0.5 }}
      >
        <Stack direction="row" alignItems="center" gap={1.5}>
          <WarningAmberRoundedIcon sx={{ color: '#e65100', fontSize: 24 }} />
          Clear your cart?
        </Stack>
      </DialogTitle>

      <DialogContent>
        <DialogContentText
          sx={{ fontFamily: brand.fontBase, color: brand.textSecondary, fontSize: '0.9rem' }}
        >
          This will remove all {itemCount > 0 ? `${itemCount} item${itemCount !== 1 ? 's' : ''}` : 'items'} from your cart. This action cannot be undone.
        </DialogContentText>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2.5, pt: 0.5, gap: 1 }}>
        <Button
          onClick={onClose}
          variant="outlined"
          sx={{
            borderRadius: '10px',
            fontFamily: brand.fontBase,
            fontWeight: 700,
            textTransform: 'none',
            borderColor: '#e0e0e0',
            color: brand.textSecondary,
            px: 2.5,
            '&:hover': { borderColor: '#bdbdbd', backgroundColor: '#fafafa' },
          }}
        >
          Cancel
        </Button>
        <Button
          onClick={() => { onConfirm(); onClose() }}
          variant="contained"
          startIcon={<DeleteSweepOutlinedIcon />}
          sx={{
            borderRadius: '10px',
            fontFamily: brand.fontBase,
            fontWeight: 700,
            textTransform: 'none',
            backgroundColor: '#c62828',
            px: 2.5,
            '&:hover': { backgroundColor: '#b71c1c', transform: 'translateY(-1px)' },
            transition: 'all 0.2s ease',
          }}
        >
          Clear Cart
        </Button>
      </DialogActions>
    </Dialog>
  )
}