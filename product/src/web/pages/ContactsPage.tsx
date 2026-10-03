import {
  Alert,
  Box,
  Chip,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { Button } from '@truecontact/ui';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { api, type ContactSummary, errorMessage } from '../client';
import {
  CONTACT_FILTERS,
  CONTACT_SORTS,
  type ContactFilter,
  type ContactSort,
  filterAndSortContacts,
} from '../contacts-view';

const CONTACT_LIMIT = 500;

export function ContactsPage() {
  const navigate = useNavigate();
  const [version, setVersion] = useState(0);
  const [contacts, setContacts] = useState<ContactSummary[] | null>(null);
  const [importActive, setImportActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ContactFilter>('all');
  const [sort, setSort] = useState<ContactSort>('name-asc');

  useEffect(() => {
    let cancelled = false;

    Promise.all([api.contacts(CONTACT_LIMIT), api.imports()])
      .then(([contactData, importData]) => {
        if (cancelled) {
          return;
        }

        setContacts(contactData.contacts);
        setImportActive(
          importData.imports.some((job) => job.status === 'pending' || job.status === 'processing'),
        );
        setError(null);
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(errorMessage(cause));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [version]);

  const visible = useMemo(
    () => filterAndSortContacts(contacts ?? [], { query, filter, sort }),
    [contacts, query, filter, sort],
  );

  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }

  if (contacts === null) {
    return <Typography color="text.secondary">Loading…</Typography>;
  }

  if (contacts.length === 0) {
    return (
      <Stack spacing={2} sx={{ alignItems: 'flex-start' }}>
        <Typography variant="h5" component="h1">
          No contacts yet
        </Typography>
        <Typography color="text.secondary">
          Import a vCard or CSV file to build your contact graph.
        </Typography>
        <Button variant="contained" component={Link} to="/imports">
          Import contacts
        </Button>
      </Stack>
    );
  }

  return (
    <Stack spacing={2}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1.5}
        sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' } }}
      >
        <Box>
          <Typography variant="h5" component="h1">
            Contacts
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {contacts.length} contact{contacts.length === 1 ? '' : 's'}
            {visible.length !== contacts.length ? ` · ${visible.length} shown` : ''}
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
          <Button size="small" variant="outlined" onClick={() => setVersion((value) => value + 1)}>
            Refresh
          </Button>
          <Button size="small" variant="contained" component={Link} to="/imports">
            Import
          </Button>
          <Button size="small" variant="outlined" component="a" href="/api/export/vcard" download>
            Export vCard
          </Button>
          <Button size="small" variant="outlined" component="a" href="/api/export/csv" download>
            Export CSV
          </Button>
        </Stack>
      </Stack>

      {importActive && (
        <Alert severity="info">
          An import is in progress — this list may change when it finishes. Use Refresh to reload
          it.
        </Alert>
      )}

      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={1.5}
        sx={{ alignItems: { md: 'center' } }}
      >
        <TextField
          type="search"
          placeholder="Search name, phone, or email"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          sx={{ flexGrow: 1, minWidth: 220 }}
        />
        <ToggleButtonGroup
          size="small"
          exclusive
          value={filter}
          onChange={(_event, value: ContactFilter | null) => {
            if (value !== null) {
              setFilter(value);
            }
          }}
          aria-label="Filter contacts"
        >
          {CONTACT_FILTERS.map((option) => (
            <ToggleButton key={option.value} value={option.value}>
              {option.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        <TextField
          select
          label="Sort"
          value={sort}
          onChange={(event) => setSort(event.target.value as ContactSort)}
          sx={{ minWidth: 170 }}
        >
          {CONTACT_SORTS.map((option) => (
            <MenuItem key={option.value} value={option.value}>
              {option.label}
            </MenuItem>
          ))}
        </TextField>
      </Stack>

      {visible.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}>
          <Typography color="text.secondary">No contacts match this search or filter.</Typography>
        </Paper>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small" aria-label="Contacts">
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Phone / Email</TableCell>
                <TableCell align="right">Review</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {visible.map((contact) => (
                <TableRow
                  key={contact.id}
                  hover
                  onClick={() => navigate(`/contacts/${contact.id}`)}
                  sx={{ cursor: 'pointer' }}
                >
                  <TableCell>
                    <Link to={`/contacts/${contact.id}`}>{contact.displayName}</Link>
                  </TableCell>
                  <TableCell>
                    {primaryValue(contact)}
                    {extraValueCount(contact) > 0 ? (
                      <Typography variant="caption" color="text.secondary">
                        {` +${extraValueCount(contact)}`}
                      </Typography>
                    ) : null}
                  </TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={0.5} sx={{ justifyContent: 'flex-end' }}>
                      {contact.openConflicts > 0 && (
                        <Chip
                          size="small"
                          color="warning"
                          label={`${contact.openConflicts} conflict${
                            contact.openConflicts === 1 ? '' : 's'
                          }`}
                        />
                      )}
                      {contact.proposedLinks > 0 && (
                        <Chip
                          size="small"
                          variant="outlined"
                          label={`${contact.proposedLinks} to review`}
                        />
                      )}
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {contacts.length === CONTACT_LIMIT && (
        <Typography variant="caption" color="text.secondary">
          Showing the {CONTACT_LIMIT} most recently updated contacts.
        </Typography>
      )}
    </Stack>
  );
}

function primaryValue(contact: ContactSummary): string {
  return contact.phones[0]?.value ?? contact.emails[0]?.value ?? '—';
}

function extraValueCount(contact: ContactSummary): number {
  return Math.max(0, contact.phones.length + contact.emails.length - 1);
}
