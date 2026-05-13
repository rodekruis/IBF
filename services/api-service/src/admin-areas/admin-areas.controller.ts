import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';

import { AdminAreasService } from '@api-service/src/admin-areas/admin-areas.service';
import { AdminAreaCreateDto } from '@api-service/src/admin-areas/dto/admin-area-create.dto';
import { AdminAreaResponseDto } from '@api-service/src/admin-areas/dto/admin-area-response.dto';
import { AdminAreaUpdateDto } from '@api-service/src/admin-areas/dto/admin-area-update.dto';
import { AuthenticatedUser } from '@api-service/src/guards/authenticated-user.decorator';
import { AuthenticatedUserGuard } from '@api-service/src/guards/authenticated-user.guard';

@ApiTags('admin-areas')
@UseGuards(AuthenticatedUserGuard)
@Controller('admin-areas')
export class AdminAreasController {
  public constructor(private readonly adminAreasService: AdminAreasService) {}

  @AuthenticatedUser({ isGuarded: true, allowPipelineApiKey: true })
  @Get()
  @ApiOperation({
    summary: 'Get admin areas by country, optionally filtered by admin level',
  })
  @ApiQuery({ name: 'countryCodeIso3', required: true, example: 'KEN' })
  @ApiQuery({ name: 'adminLevel', required: false, example: 1 })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Admin areas returned successfully',
    type: [AdminAreaResponseDto],
  })
  public async getAdminAreas(
    @Query('countryCodeIso3') countryCodeIso3: string,
    @Query('adminLevel', new ParseIntPipe({ optional: true }))
    adminLevel?: number,
  ): Promise<AdminAreaResponseDto[]> {
    return this.adminAreasService.getAdminAreas({
      countryCodeIso3,
      adminLevel,
    });
  }

  @AuthenticatedUser({ isGuarded: true, allowPipelineApiKey: true })
  @Get(':placeCode')
  @ApiOperation({ summary: 'Get admin area by place code' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Admin area returned successfully',
    type: AdminAreaResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Admin area not found',
  })
  public async getAdminArea(
    @Param('placeCode') placeCode: string,
  ): Promise<AdminAreaResponseDto> {
    return this.adminAreasService.getAdminAreaOrThrow(placeCode);
  }

  @AuthenticatedUser({ isGuarded: true, isAdmin: true })
  @Post()
  @ApiOperation({ summary: 'Create an admin area' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Admin area created successfully',
    type: AdminAreaResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Admin area already exists',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Country does not exist',
  })
  public async createAdminArea(
    @Body() adminAreaCreateDto: AdminAreaCreateDto,
  ): Promise<AdminAreaResponseDto> {
    return this.adminAreasService.createAdminArea(adminAreaCreateDto);
  }

  @AuthenticatedUser({ isGuarded: true, isAdmin: true })
  @Patch(':placeCode')
  @ApiOperation({ summary: 'Update an admin area' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Admin area updated successfully',
    type: AdminAreaResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Admin area not found',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Country does not exist',
  })
  public async updateAdminArea(
    @Param('placeCode') placeCode: string,
    @Body() adminAreaUpdateDto: AdminAreaUpdateDto,
  ): Promise<AdminAreaResponseDto> {
    return this.adminAreasService.updateAdminAreaOrThrow(
      placeCode,
      adminAreaUpdateDto,
    );
  }

  @AuthenticatedUser({ isGuarded: true, isAdmin: true })
  @Delete(':placeCode')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an admin area' })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Admin area deleted successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Admin area not found',
  })
  public async deleteAdminArea(
    @Param('placeCode') placeCode: string,
  ): Promise<void> {
    await this.adminAreasService.deleteAdminAreaOrThrow(placeCode);
  }
}
