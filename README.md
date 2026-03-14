# site4

Static website hosted on a Raspberry Pi server.

## How Deployment Works

This repo uses GitHub Actions with a self-hosted runner on the Pi to automatically deploy changes.

### The workflow

1. You edit files locally (or directly on GitHub)
2. You push (or merge) changes to the `main` branch
3. GitHub Actions automatically triggers a deployment
4. The self-hosted runner on the Pi picks up the job
5. It checks out the latest code and rsyncs it directly to `/var/www/site4/`
6. The live site is updated within seconds

### Making changes

```bash
# Clone the repo
git clone git@github.com:littlejamjar-sys/site4.git
cd site4

# Make your edits, then:
git add .
git commit -m "describe your change"
git push origin main
# Deployment starts automatically
```

### Workflow file

The deployment is defined in `.github/workflows/deploy.yml`.

### Runner

The self-hosted runner lives at `~/actions-runner-sites/` on the Pi and runs as a systemd service. It listens for jobs from this repo and executes them locally.
