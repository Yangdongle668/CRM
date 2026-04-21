import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SearchService, SearchType } from './search.service';

const VALID_TYPES: SearchType[] = ['customer', 'lead', 'order', 'email'];

@Controller('search')
@UseGuards(JwtAuthGuard)
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  async search(
    @Query('q') q: string,
    @Query('types') typesStr: string,
    @Query('limit') limitStr: string,
    @CurrentUser() user: { id: string; role: string },
  ) {
    const types = typesStr
      ? (typesStr
          .split(',')
          .map((t) => t.trim())
          .filter((t): t is SearchType =>
            VALID_TYPES.includes(t as SearchType),
          ))
      : undefined;

    const limit = limitStr ? Number(limitStr) : undefined;

    return this.searchService.globalSearch(q, user, { types, limit });
  }
}
