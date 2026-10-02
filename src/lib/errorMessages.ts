/**
 * Converts database/API errors to user-friendly messages
 */
export const getErrorMessage = (error: Error, context?: string): string => {
  const message = error.message?.toLowerCase() || '';

  // Unique constraint violations
  if (message.includes('unique constraint') || message.includes('duplicate key')) {
    if (message.includes('unique_brand_name')) {
      return 'A brand with this name already exists. Please use a different name.';
    }
    if (message.includes('unique_publisher_name')) {
      return 'A publisher with this name already exists. Please use a different name.';
    }
    if (message.includes('unique_inspo_name')) {
      return 'An inspiration with this name already exists. Please use a different name.';
    }
    if (message.includes('unique_theme_name')) {
      return 'A theme with this name already exists. Please use a different name.';
    }
    if (message.includes('unique_product_name_brand')) {
      return 'A product with this name already exists for this brand. Please use a different name.';
    }
    if (message.includes('unique_product_images_order')) {
      return 'There was an issue with image ordering. Please try again.';
    }
    if (message.includes('unique_comparison_brands_order')) {
      return 'There was an issue with comparison brand ordering. Please try again.';
    }
    if (message.includes('unique_users_email')) {
      return 'A user with this email already exists.';
    }
    return `This ${context || 'item'} already exists. Please use a different name.`;
  }

  // Foreign key violations
  if (message.includes('foreign key') || message.includes('violates foreign key')) {
    if (message.includes('brand')) {
      return 'The selected brand no longer exists. Please select a different brand.';
    }
    if (message.includes('publisher')) {
      return 'The selected publisher no longer exists. Please select a different publisher.';
    }
    if (message.includes('product')) {
      return 'The related product no longer exists. Please refresh and try again.';
    }
    return 'A related item no longer exists. Please refresh the page and try again.';
  }

  // Storage errors
  if (message.includes('storage') || message.includes('upload')) {
    if (message.includes('file size') || message.includes('too large')) {
      return 'The file is too large. Please upload a smaller file.';
    }
    if (message.includes('invalid') || message.includes('type')) {
      return 'Invalid file type. Please upload a valid image file.';
    }
    return 'Failed to upload file. Please try again.';
  }

  // Network errors
  if (message.includes('network') || message.includes('fetch') || message.includes('connection')) {
    return 'Network error. Please check your internet connection and try again.';
  }

  // RLS / Permission errors
  if (message.includes('row-level security') || message.includes('policy')) {
    return 'You do not have permission to perform this action.';
  }

  // ClickUp user not found
  if (message.includes('not found in clickup') || (message.includes('clickup') && message.includes('not found'))) {
    return 'Please first create the user in ClickUp with the same email address, then create the user here.';
  }

  // Not found errors
  if (message.includes('not found') || message.includes('no rows')) {
    return `The ${context || 'item'} could not be found. It may have been deleted.`;
  }

  // Timeout errors
  if (message.includes('timeout') || message.includes('timed out')) {
    return 'The operation took too long. Please try again.';
  }

  // Default: return the actual error message
  if (error.message && error.message.trim()) {
    return error.message;
  }

  return `Something went wrong. Please try again.`;
};
