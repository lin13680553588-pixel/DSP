# Amazon DSP Line-item Daily Sync

This glossary defines the business language used by this project. Historical AMC terminology is not part of the current sync.

## Core terms

**Line-item daily record**
One reporting row for one date, country, DSP Order, and DSP Line item.

**Report date**
The calendar date represented by a row. It is independent of an attribution window.

**Campaign name**
The customer-facing column that contains the Amazon DSP Order name.

**Ad group name**
The customer-facing column that contains the Amazon DSP Line item name. Amazon interfaces may also call this entity an ad group.

**14-day attributed metric**
A metric such as DPV, add-to-cart, purchases, units, or sales that uses Amazon's 14-day attribution rule. The suffix `14d` describes attribution, not a 14-day report-date range.

**Zero-traffic record**
A record whose impressions and local-currency spend are both zero. The current business rule excludes it. This is only a practical proxy for inactivity, not proof that the Order or Line item has a non-delivering status.

**Fixed USD conversion**
German EUR spend and sales are displayed in USD using the agreed fixed rate of `1 EUR = 1.15 USD`. This is not a live foreign-exchange rate.

**Business key**
The combination of report date, country, Campaign name, and Ad group name used to identify the same row during an update.

**Backfill**
A manual run for a specific historical report date. Repeating a backfill updates the matching records rather than intentionally creating duplicates.
