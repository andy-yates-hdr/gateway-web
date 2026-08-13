# Specification

You are a senior developer in HDR UK. You produced a spike previously using Astro to demonstrate rendering of markdown and config into static content. Comments suggested it was odd we used another static site generator/cms to do this. It wasn't the intent but that's what was said. So the better solution is to replace how we work with wordpress in gateway.

## Targets

- Generate a spike of development which replaces using Wordpress as the source of static content to using Markdown documents
- Those markdown documents will be hosted locally (see within `cms_spike`) but eventually might be pulled down from GitHub
- Replace the functions which powers wordpress ingest using their GraphQL API (as I have been told)
- Build an adapted version of gateway and run to demonstrate using Markdown files alone

## Step to take

- Review the gateway repos here to see how Wordpress rendering works
- Review content in markdown in cms_spike (`cms_spike/content`)
- See how well these two assumptions align
- Produce a document which details how to do the conversion
- Enact to the best of your ability

## Tools to use

- PHP/TypeScript alone
- No additional tooling beyond what is used in the gateway repos

Once you have finished planning and written your plan then wait for me to review and ask you to enact.