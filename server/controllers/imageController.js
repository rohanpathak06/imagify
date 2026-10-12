
import axios from 'axios'
import userModel from '../models/userModel.js'

export const generateImage = async (req, res) => {
  try {
    const { prompt } = req.body
    const { userId } = req.body

    // Validate the prompt
    if (
      typeof prompt !== 'string' ||
      !prompt.trim() ||
      prompt.length > 2048
    ) {
      return res.status(400).json({
        success: false,
        message: 'Enter a prompt between 1 and 2048 characters'
      })
    }

    // Fetch the authenticated user
    const user = await userModel.findById(userId)

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      })
    }

    // Check available credits
    if (user.creditBalance < 1) {
      return res.json({
        success: false,
        message: 'No Credit Balance',
        creditBalance: user.creditBalance
      })
    }

    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
    const apiToken = process.env.CLOUDFLARE_API_TOKEN

    if (!accountId || !apiToken) {
      throw new Error('Cloudflare AI credentials are missing')
    }

    // Generate image using Cloudflare Workers AI
    const response = await axios.post(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/black-forest-labs/flux-1-schnell`,
      {
        prompt: prompt.trim(),
        steps: 4
      },
      {
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 120000
      }
    )

    const base64Image = response.data?.result?.image

    if (!base64Image) {
      throw new Error('Cloudflare did not return an image')
    }

    // FLUX.1 schnell returns a Base64-encoded JPEG
    const resultImage =
      `data:image/jpeg;base64,${base64Image}`

    // Deduct a credit only after successful generation
    const updatedUser = await userModel.findByIdAndUpdate(
      user._id,
      { $inc: { creditBalance: -1 } },
      { new: true }
    )

    if (!updatedUser) {
      throw new Error('Could not update user credits')
    }

    return res.json({
      success: true,
      message: 'Image generated successfully',
      resultImage,
      creditBalance: updatedUser.creditBalance
    })

  } catch (error) {
    console.error(
      'Cloudflare image generation error:',
      error.response?.data || error.message
    )

    return res.status(error.response?.status || 500).json({
      success: false,
      message:
        error.response?.data?.errors?.[0]?.message ||
        'Image generation failed. Please try again.'
    })
  }
}
