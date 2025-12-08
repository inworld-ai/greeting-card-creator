# Project Copy Setup

This is a copy of the "Calm Personalized Storyteller" project, set up as a separate project for independent deployment.

## Important Notes

1. **Separate Vercel Deployment**: This project can be deployed to Vercel as a completely separate project from the original.

2. **Environment Variables**: 
   - The `.env` file was copied from the original project
   - **You should update it with your own API keys** or create new ones for this separate deployment
   - When deploying to Vercel, set environment variables separately:
     ```bash
     vercel env add GOOGLE_API_KEY
     vercel env add INWORLD_API_KEY
     ```

3. **Package Name**: The package.json has been updated to `christmas-personalized-storyteller` to differentiate it from the original.

4. **Independent Updates**: You can now make changes to this copy without affecting the original project.

## Next Steps

1. Install dependencies:
   ```bash
   cd "/Users/clintmclean/Christmas Personalized Storyteller"
   npm install
   ```

2. Update `.env` file with your API keys (or use different keys for this deployment)

3. Test locally:
   ```bash
   cd "/Users/clintmclean/Christmas Personalized Storyteller"
   npm run dev:all
   ```

4. Deploy to Vercel:
   ```bash
   cd "/Users/clintmclean/Christmas Personalized Storyteller"
   vercel
   vercel env add GOOGLE_API_KEY
   vercel env add INWORLD_API_KEY
   vercel --prod
   ```

## Making This Your Own

Feel free to:
- Update the project name in `package.json`
- Modify the code for your specific needs
- Set up separate Vercel environment variables
- Make any other customizations you need

