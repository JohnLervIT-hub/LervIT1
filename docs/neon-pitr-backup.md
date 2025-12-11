# LervIT Database Backup & Recovery Guide

## Neon Database Point-In-Time Recovery (PITR)

### Overview
LervIT uses Neon's serverless PostgreSQL for data storage. Neon provides automatic backups and Point-In-Time Recovery (PITR) depending on your plan.

### Current Plan Requirements

#### Free Tier (Starter)
- **Backup Retention**: 7 days of history
- **PITR**: Limited to branch history (7 days)
- **Limitations**: No dedicated compute, shared resources

#### Launch Plan ($19/month) - RECOMMENDED for Production
- **Backup Retention**: 7 days of history
- **PITR**: Full Point-In-Time Recovery
- **Benefits**: 
  - 10 GiB storage included
  - 300 compute hours/month
  - Better performance for production workloads

#### Scale Plan ($69/month) - For Growth
- **Backup Retention**: 14 days of history
- **PITR**: Full Point-In-Time Recovery
- **Benefits**:
  - 50 GiB storage included
  - 750 compute hours/month
  - Autoscaling compute

### How to Check Your Current Plan

1. Go to [Neon Console](https://console.neon.tech/)
2. Select your project
3. Navigate to **Settings** > **Billing**
4. View your current plan and usage

### How to Restore from Backup (PITR)

#### Method 1: Neon Console UI
1. Go to [Neon Console](https://console.neon.tech/)
2. Select your project
3. Navigate to **Branches**
4. Click **Restore** on the branch you want to recover
5. Select the point in time to restore to
6. Create a new branch from that point

#### Method 2: Using Replit Checkpoints
Replit automatically creates checkpoints that include:
- Code state
- Database state (when using built-in PostgreSQL)
- Chat session history

To rollback:
1. Open the Checkpoints panel in Replit
2. Select the checkpoint from before the issue
3. Click "Restore to this checkpoint"

### Manual Backup Script (Optional)

For additional peace of mind, you can run periodic backups:

```bash
# Export database to JSON (non-destructive)
curl -X GET https://your-app.replit.app/api/admin/export-backup \
  -H "Cookie: your-session-cookie" \
  -o backup-$(date +%Y%m%d).json
```

### Recommendations

1. **Upgrade to Launch Plan** if you're handling real customer payments
2. **Test recovery process** before going live by creating a test branch
3. **Enable email alerts** in Neon console for usage warnings
4. **Use Replit checkpoints** as primary rollback mechanism during development

### Disaster Recovery Checklist

- [ ] Verify Neon plan supports PITR (Launch or Scale)
- [ ] Document connection string location (Replit Secrets)
- [ ] Test branch restore process in staging
- [ ] Set up usage alerts in Neon console
- [ ] Document rollback procedures for team members

### Support Contacts

- **Neon Support**: support@neon.tech
- **Replit Support**: Built-in support chat or support@replit.com
